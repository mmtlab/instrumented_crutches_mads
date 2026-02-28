"""
FastAPI backend for instrumented crutches acquisition system.
Designed for Raspberry Pi Zero 2 W - plain HTTP, no auth, maximum simplicity.
"""
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import asyncio
from contextlib import asynccontextmanager
import json
import random
import subprocess
from datetime import datetime
from pathlib import Path
import io
import csv
import sys
import os

import h5py
import numpy as np
import uvicorn
from dateutil import parser as date_parser
import zipfile
import tempfile

# Initialize MADS agent
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, 'python'))

from mads_agent import Agent, EventType, MessageType, mads_version, mads_default_settings_uri

# Global MADS agent instance
mads_agent = None
status_messages = []  # Buffer for status messages from error_handler
status_task = None
status_task_stop = None

# Status state tracking - keeps last status for each source
status_state = {}  # Maps source_key (e.g., "coordinator", "tip_loadcell_left") to latest status info

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and shutdown resources using lifespan events."""
    global status_task
    success = init_mads_agent()
    if success:
        print("✓ MADS agent connected successfully")
        status_task = asyncio.create_task(status_polling_loop())
    else:
        print("✗ Failed to initialize MADS agent - commands will fail", file=sys.stderr)
    try:
        yield
    finally:
        global mads_agent, status_task_stop
        if status_task_stop is not None:
            status_task_stop.set()
        if status_task:
            status_task.cancel()
        if mads_agent:
            try:
                mads_agent.disconnect()
                print("MADS agent disconnected")
            except Exception as e:
                print(f"Error disconnecting MADS agent: {e}", file=sys.stderr)


app = FastAPI(title="Instrumented Crutches", lifespan=lifespan)

# Data directory and index file
DATA_DIR = Path("data")
INDEX_FILE = DATA_DIR / "index.json"


def init_mads_agent():
    """Initialize MADS agent connection"""
    global mads_agent
    try:
        mads_agent = Agent("web_server", "tcp://localhost:9092")
        mads_agent.set_id("web_server")
        mads_agent.set_settings_timeout(2000)
        if mads_agent.init() != 0:
            print("Warning: Cannot contact MADS broker", file=sys.stderr)
            return False
        print(f"MADS agent initialized with settings: {mads_agent.settings()}")
        mads_agent.connect()
        # Subscribe to status topic to receive messages from error_handler
        # mads_agent.subscribe("status") # subscribe() doesn't exist, it is handled by the sub_topic field in MADS settings (mads.ini file)
        mads_agent.set_receive_timeout(100)  # 100ms timeout for non-blocking receive
        return True
    except Exception as e:
        print(f"Error initializing MADS agent: {e}", file=sys.stderr)
        return False


def check_status_messages():
    """Check for incoming status messages from error_handler (non-blocking)"""
    global mads_agent, status_messages, status_state
    if not mads_agent:
        return
    
    try:
        msg_type = mads_agent.receive()
        if msg_type != MessageType.NONE:
            topic, message = mads_agent.last_message()
            
            #print(f"Received message on topic '{topic}': {message}")
            if topic == "status":
                # Extract status payload from nested structure
                if isinstance(message, dict) and "status" in message:
                    payload = message["status"]
                elif isinstance(message, dict):
                    payload = message
                else:
                    payload = {
                        "timestamp": datetime.now().isoformat(),
                        "level": "info",
                        "message": str(message)
                    }
                
                # Ensure timestamp exists
                if isinstance(payload, dict) and "timestamp" not in payload:
                    payload["timestamp"] = datetime.now().isoformat()
                
                # Extract side from source if present (e.g., "tip_loadcell_left" -> side="left")
                source = payload.get("source", "system")
                side = extract_side_from_source(source)
                if side and "side" not in payload:
                    payload["side"] = side
                    
                status_messages.append(payload)
                print(f"✓ Status message added to buffer. Total messages: {len(status_messages)}")
                print(f"✓ Payload: {payload}")
                
                # Update status state - track last status for each source
                source_key = get_status_source_key(source)
                status_state[source_key] = {
                    "source": source,
                    "side": side,
                    "level": payload.get("level", "info"),
                    "message": payload.get("message", ""),
                    "status": payload.get("status", ""),
                    "timestamp": payload.get("timestamp")
                }
                print(f"✓ Status state updated: {source_key} = {status_state[source_key]}")
                
                # Keep only last 100 messages
                if len(status_messages) > 100:
                    status_messages.pop(0)
    except Exception as e:
        print(f"Error receiving status message: {e}", file=sys.stderr)


def extract_side_from_source(source: str) -> str:
    """Extract side (left/right) from source string if present.
    
    Examples:
        "tip_loadcell_left" -> "left"
        "tip_loadcell_right" -> "right"
        "coordinator" -> ""
    """
    if not source:
        return ""
    source_lower = source.lower()
    if source_lower.endswith("_left"):
        return "left"
    if source_lower.endswith("_right"):
        return "right"
    return ""


def get_status_source_key(source: str) -> str:
    """Get normalized source key for status state tracking.
    
    Examples:
        "coordinator" -> "coordinator"
        "tip_loadcell_left" -> "tip_loadcell_left"
        "hdf5_writer" -> "hdf5_writer"
    """
    return (source or "system").lower().replace(".plugin", "")


def build_status_message_key(payload: dict) -> str:
    """Build a stable key for status messages (matches frontend)."""
    source = payload.get("source", "system")
    side = payload.get("side")
    side_suffix = f" ({side})" if side else ""
    text = payload.get("message") or payload.get("error") or payload.get("detail") or "Status update"
    message_text = f"{source}{side_suffix}: {text}"
    ts = payload.get("timestamp") or payload.get("timecode") or ""
    return f"{message_text}::{ts}"


async def status_polling_loop(poll_interval: float = 0.2):
    """Background task to poll status messages periodically."""
    global status_task_stop
    if status_task_stop is None:
        status_task_stop = asyncio.Event()
    try:
        while not status_task_stop.is_set():
            check_status_messages()
            await asyncio.sleep(poll_interval)
    except asyncio.CancelledError:
        return


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text(json.dumps({"acquisitions": []}, ensure_ascii=False))


def load_index():
    ensure_data_dir()
    try:
        obj = json.loads(INDEX_FILE.read_text())
        items = obj.get("acquisitions", [])
        return {item["id"]: item for item in items if "id" in item}
    except Exception:
        return {}


def save_index(acq_dict):
    ensure_data_dir()
    INDEX_FILE.write_text(json.dumps({"acquisitions": list(acq_dict.values())}))


def compute_next_id(acq_dict):
    max_num = 0
    for k in acq_dict.keys():
        try:
            # Handle both acq_19 and acq_0019 formats
            num = int(k.replace("acq_", "").lstrip("0") or "0")
            if num > max_num:
                max_num = num
        except Exception:
            continue
    return max_num + 1


def data_file_path(acq_id: str) -> Path:
    return DATA_DIR / f"{acq_id}.h5"


def send_mads_command(command: str, acq_id: str = None):
    """Send command via MADS agent to ws_command topic"""
    global mads_agent
    
    if not mads_agent:
        print(f"❌ MADS agent not initialized", file=sys.stderr)
        return False, "MADS agent not initialized"
    
    payload_dict = {"command": command}
    if acq_id:
        # Extract numeric ID from "acq_19" or "acq_0019" format
        try:
            id_num = int(acq_id.replace('acq_', ''))
            payload_dict["id"] = id_num
        except (IndexError, ValueError):
            payload_dict["id"] = acq_id
    
    try:
        # Publish message to ws_command topic
        topic = "ws_command"
        print(f"📤 Publishing to '{topic}': {payload_dict}", file=sys.stderr)
        mads_agent.publish(topic, payload_dict)
        print(f"✅ Successfully published: {payload_dict}", file=sys.stderr)
        return True, "ok"
    except Exception as exc:
        print(f"❌ Exception publishing: {exc}", file=sys.stderr)
        return False, str(exc)


async def send_mads_command_async(command: str, acq_id: str = None):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, send_mads_command, command, acq_id)


def read_hdf5_data(file_path: Path):
    """Read HDF5 file with loadcell data and convert timestamps to relative seconds."""
    try:
        with h5py.File(file_path, 'r') as f:
            result = {}
            
            # Check for new unified format: /tip_loadcell/{force, side, timestamp}
            if '/tip_loadcell/force' in f and '/tip_loadcell/side' in f and '/tip_loadcell/timestamp' in f:
                # Read unified arrays
                force_data = f['/tip_loadcell/force'][:]
                side_data = f['/tip_loadcell/side'][:]
                timestamp_data = f['/tip_loadcell/timestamp'][:]
                
                # Decode side strings if they are bytes
                if len(side_data) > 0 and isinstance(side_data[0], bytes):
                    side_data = [s.decode('utf-8') for s in side_data]
                
                # Decode timestamp strings if they are bytes
                if len(timestamp_data) > 0 and isinstance(timestamp_data[0], bytes):
                    timestamp_data = [ts.decode('utf-8') for ts in timestamp_data]
                
                # Parse timestamps to milliseconds epoch
                ts_ms = []
                for ts_str in timestamp_data:
                    dt = date_parser.parse(ts_str)
                    ts_ms.append(int(dt.timestamp() * 1000))
                
                # Find start time for relative calculation
                start_time_ms = ts_ms[0] if ts_ms else 0
                
                # Separate data by side
                left_force = []
                left_ts_relative = []
                right_force = []
                right_ts_relative = []
                
                for i in range(len(force_data)):
                    side = side_data[i].lower() if isinstance(side_data[i], str) else str(side_data[i]).lower()
                    ts_relative = (ts_ms[i] - start_time_ms) / 1000.0
                    
                    if side == 'left':
                        left_force.append(float(force_data[i]))
                        left_ts_relative.append(ts_relative)
                    elif side == 'right':
                        right_force.append(float(force_data[i]))
                        right_ts_relative.append(ts_relative)
                
                # Add to result
                if left_force:
                    result["left"] = left_force
                    result["ts_left"] = left_ts_relative
                
                if right_force:
                    result["right"] = right_force
                    result["ts_right"] = right_ts_relative
                
                # Calculate total samples
                total_samples = len(left_force) + len(right_force)
                result["samples"] = total_samples
            
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading HDF5 file: {str(e)}")


def generate_mock_data(num_samples: int):
    """Generate mock data for testing when no HDF5 file exists."""
    timestamps = [i * 0.01 for i in range(num_samples)]  # 100 Hz sampling
    left_force = [max(0, 50 + 30 * random.random() + random.uniform(-5, 5)) for _ in range(num_samples)]
    right_force = [max(0, 45 + 25 * random.random() + random.uniform(-5, 5)) for _ in range(num_samples)]
    left_angle = [15 + 10 * random.random() + random.uniform(-2, 2) for _ in range(num_samples)]
    right_angle = [17 + 8 * random.random() + random.uniform(-2, 2) for _ in range(num_samples)]
    return {
        "timestamp": timestamps,
        "left_force": left_force,
        "right_force": right_force,
        "left_angle": left_angle,
        "right_angle": right_angle,
    }


# In-memory storage (no database) initialized from index
acquisitions = load_index()
current_acquisition_id = None
next_id = compute_next_id(acquisitions)

# Update sample counts from HDF5 files if they exist
for acq_id, acq in acquisitions.items():
    h5_path = data_file_path(acq_id)
    if h5_path.exists() and acq.get("samples", 0) == 0:
        try:
            with h5py.File(h5_path, 'r') as f:
                # Try to get sample count from timestamp dataset
                if '/tip_loadcell/time.left' in f:
                    samples = len(f['/tip_loadcell/time.left'][:])
                elif '/tip_loadcell/time.right' in f:
                    samples = len(f['/tip_loadcell/time.right'][:])
                elif '/loadcell/timestamp' in f:
                    samples = len(f['/loadcell/timestamp'][:])
                elif '/loadcell/left' in f:
                    samples = len(f['/loadcell/left'][:])
                elif '/loadcell/right' in f:
                    samples = len(f['/loadcell/right'][:])
                else:
                    samples = 0
                acq["samples"] = samples
        except Exception:
            pass


# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Redirect to control page."""
    return FileResponse("static/control.html")


@app.get("/favicon.ico")
async def favicon():
    """Serve favicon for browsers."""
    return FileResponse("static/favicon.ico")

@app.get("/apple-touch-icon.png")
async def apple_touch_icon():
    """Serve apple touch icon for iOS."""
    return FileResponse("static/favicon.ico")

@app.get("/android-chrome-192x192.png")
async def android_chrome_192():
    """Serve android chrome icon 192x192."""
    return FileResponse("static/favicon.ico")

@app.get("/android-chrome-512x512.png")
async def android_chrome_512():
    """Serve android chrome icon 512x512."""
    return FileResponse("static/favicon.ico")


@app.post("/start")
async def start_acquisition(test_config: dict = None):
    """Start a fake acquisition and return generated acquisition id."""
    global current_acquisition_id, next_id, acquisitions, mads_agent
    
    if current_acquisition_id is not None:
        return {
            "status": "error",
            "message": "Acquisition already running",
            "acquisition_id": current_acquisition_id
        }
    
    # Generate new acquisition id
    acquisition_id = f"acq_{next_id}"
    next_id += 1
    
    # Send start command with subject_id and session_id if mads_agent is available
    if not mads_agent:
        return {
            "status": "error",
            "message": "MADS agent not initialized"
        }
    
    try:
        topic = "ws_command"
        start_payload = {"command": "start", "id": int(acquisition_id.replace('acq_', ''))}
        
        # Add subject_id if provided
        subject_id = test_config.get("subject_id") if test_config else None
        if subject_id is not None:
            start_payload["subject_id"] = subject_id
        
        # Add session_id if provided
        session_id = test_config.get("session_id") if test_config else None
        if session_id is not None:
            start_payload["session_id"] = session_id
        
        mads_agent.publish(topic, start_payload)
    except Exception as exc:
        return {
            "status": "error",
            "message": f"mads start failed: {exc}"
        }
    
    # Create acquisition record with test configuration
    acq_record = {
        "id": acquisition_id,
        "start_time": datetime.now().isoformat(),
        "status": "running",
        "samples": 0
    }
    
    # Add test configuration if provided
    if test_config:
        acq_record["test_config"] = {
            "subject_id": test_config.get("subject_id"),
            "session_id": test_config.get("session_id"),
            "height_cm": test_config.get("height_cm"),
            "weight_kg": test_config.get("weight_kg"),
            "crutch_height": test_config.get("crutch_height")
        }
        
        # Add initial comment if provided
        comment = test_config.get("comment", "").strip()
        if comment:
            timestamp = datetime.now().isoformat()
            acq_record["comments"] = [f"[{timestamp}] {comment}"]
    
    acquisitions[acquisition_id] = acq_record
    save_index(acquisitions)
    
    current_acquisition_id = acquisition_id
    
    # Send current condition command if condition_id is provided and mads_agent is available
    condition_id = test_config.get("condition_id", "").strip() if test_config else ""
    if condition_id and mads_agent:
        try:
            topic = "ws_command"
            mads_agent.publish(topic, {"command": "condition", "label": condition_id})
        except Exception as exc:
            # Log but don't fail the start if condition publish fails
            print(f"Warning: Failed to publish condition command: {exc}", file=sys.stderr)
    
    return {
        "status": "started",
        "acquisition_id": acquisition_id,
        "message": f"Acquisition {acquisition_id} started"
    }


@app.post("/stop")
async def stop_acquisition():
    """Stop the current acquisition."""
    global current_acquisition_id, acquisitions
    
    if current_acquisition_id is None:
        return {
            "status": "error",
            "message": "No acquisition running"
        }
    
    success, mads_output = await send_mads_command_async("stop", current_acquisition_id)
    if not success:
        return {
            "status": "error",
            "message": f"mads stop failed: {mads_output}"
        }
    
    # Update acquisition record
    acquisition_id = current_acquisition_id
    if acquisition_id in acquisitions:
        acquisitions[acquisition_id]["status"] = "completed"
        acquisitions[acquisition_id]["stop_time"] = datetime.now().isoformat()
        # Sample count will be determined from HDF5 file when read
        # External code saves the HDF5 file to data/acq_XXXX.h5
        save_index(acquisitions)
    
    current_acquisition_id = None

    return {
        "status": "stopped",
        "acquisition_id": acquisition_id,
        "message": f"Acquisition {acquisition_id} stopped"
    }


@app.post("/set_offset")
async def set_offset():
    """Send set_offset command via mads."""
    try:
        success, mads_output = await send_mads_command_async("set_offset")
        if not success:
            return {
                "status": "error",
                "message": f"mads command failed: {mads_output}"
            }
        
        return {
            "status": "success",
            "message": "Offset set"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
    
@app.post("/health_status")
async def health_status():
    """Send health_status command via mads."""
    try:
        success, mads_output = await send_mads_command_async("get_agents_status")
        if not success:
            return {
                "status": "error",
                "message": f"mads command failed: {mads_output}"
            }
        
        return {
            "status": "success",
            "message": "Health status sent"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


@app.post("/save_comment")
async def save_comment(comment_data: dict):
    """Save comment to the current or most recent acquisition."""
    global acquisitions, current_acquisition_id
    
    comment = comment_data.get("comment", "").strip()
    if not comment:
        return {
            "status": "error",
            "message": "Comment cannot be empty"
        }
    
    # Determine which acquisition to add comment to
    target_acq_id = None
    
    if current_acquisition_id:
        # Add to current acquisition
        target_acq_id = current_acquisition_id
    elif acquisitions:
        # Add to most recent acquisition
        sorted_acqs = sorted(acquisitions.values(), key=lambda x: x.get("start_time", ""), reverse=True)
        target_acq_id = sorted_acqs[0]["id"]
    else:
        return {
            "status": "error",
            "message": "No acquisitions found"
        }
    
    # Add comment with timestamp
    timestamp = datetime.now().isoformat()
    comment_entry = f"[{timestamp}] {comment}"
    
    if "comments" not in acquisitions[target_acq_id]:
        acquisitions[target_acq_id]["comments"] = []
    
    acquisitions[target_acq_id]["comments"].append(comment_entry)
    save_index(acquisitions)
    
    return {
        "status": "success",
        "message": f"Comment saved to {target_acq_id}",
        "acquisition_id": target_acq_id
    }


@app.post("/save_condition")
async def save_condition(condition_data: dict):
    """Save condition to the current or most recent acquisition."""
    global acquisitions, current_acquisition_id, mads_agent
    
    condition_label = condition_data.get("condition", "").strip()
    condition_id = condition_data.get("condition_id", "").strip()
    if not condition_label:
        return {
            "status": "error",
            "message": "Condition cannot be empty"
        }
    
    # Determine which acquisition to add condition to
    target_acq_id = None
    
    if current_acquisition_id:
        # Add to current acquisition
        target_acq_id = current_acquisition_id
    elif acquisitions:
        # Add to most recent acquisition
        sorted_acqs = sorted(acquisitions.values(), key=lambda x: x.get("start_time", ""), reverse=True)
        target_acq_id = sorted_acqs[0]["id"]
    else:
        return {
            "status": "error",
            "message": "No acquisitions found"
        }

    if not condition_id:
        condition_id = condition_label

    existing_conditions = acquisitions.get(target_acq_id, {}).get("conditions", [])
    last_entry = existing_conditions[-1] if existing_conditions else None
    last_id = ""
    if isinstance(last_entry, dict):
        last_id = (last_entry.get("condition_id") or last_entry.get("condition") or "").strip()

    is_new_condition = last_id != condition_id

    if is_new_condition:
        # Add condition with timestamp
        timestamp = datetime.now().isoformat()
        condition_entry = {
            "timestamp": timestamp,
            "condition": condition_label,
            "condition_id": condition_id
        }

        if "conditions" not in acquisitions[target_acq_id]:
            acquisitions[target_acq_id]["conditions"] = []

        acquisitions[target_acq_id]["conditions"].append(condition_entry)
        save_index(acquisitions)

        if mads_agent:
            try:
                topic = "ws_command"
                mads_agent.publish(topic, {"command": "condition", "label": condition_id})
            except Exception as exc:
                return {
                    "status": "error",
                    "message": str(exc)
                }

    return {
        "status": "success",
        "message": "Condition saved" if is_new_condition else "Condition unchanged",
        "acquisition_id": target_acq_id
    }


@app.post("/eyetracker_command")
async def eyetracker_command(command_data: dict):
    """Send eye-tracker command via MADS agent to ws_command topic."""
    global mads_agent
    
    command = command_data.get("command", "").strip()
    if not command:
        return {
            "status": "error",
            "message": "Command cannot be empty"
        }
    
    if command not in ["pupil_neon_connect", "pupil_neon_disconnect"]:
        return {
            "status": "error",
            "message": "Invalid command"
        }
    
    if not mads_agent:
        return {
            "status": "error",
            "message": "MADS agent not initialized"
        }
    
    try:
        payload_dict = {"command": command}
        topic = "ws_command"
        mads_agent.publish(topic, payload_dict)
        return {
            "status": "success",
            "message": f"Command {command} sent"
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": str(exc)
        }


@app.get("/acquisitions")
async def list_acquisitions():
    """Return list of available acquisition ids."""
    
    acquisition_list = [
        {
            "id": acq["id"],
            "start_time": acq["start_time"],
            "status": acq["status"],
            "samples": acq.get("samples", 0),
            "test_config": acq.get("test_config", {}),
            "duration": acq.get("duration")
        }
        for acq in acquisitions.values()
    ]
    
    return {
        "acquisitions": acquisition_list,
        "count": len(acquisition_list),
        "current_acquisition": current_acquisition_id
    }


@app.get("/subjects")
async def list_subjects():
    """Return list of subjects with their acquisitions."""
    subjects_dict = {}
    
    # Group acquisitions by subject_id
    for acq in acquisitions.values():
        test_config = acq.get("test_config", {})
        subject_id = test_config.get("subject_id")
        
        if subject_id is not None:
            if subject_id not in subjects_dict:
                subjects_dict[subject_id] = []
            subjects_dict[subject_id].append(acq["id"])
    
    # Sort acquisitions by start_time for each subject
    for subject_id in subjects_dict:
        subjects_dict[subject_id].sort(
            key=lambda acq_id: acquisitions[acq_id].get("start_time", ""),
            reverse=True
        )
    
    return {
        "subjects": subjects_dict,
        "count": len(subjects_dict)
    }


@app.get("/last-test-config")
async def get_last_test_config():
    """Return test configuration from the last acquisition."""
    if not acquisitions:
        return {
            "test_config": None,
            "message": "No acquisitions found"
        }
    
    # Find the last acquisition (sorted by start_time)
    sorted_acqs = sorted(acquisitions.values(), key=lambda x: x.get("start_time", ""), reverse=True)
    last_acq = sorted_acqs[0]
    
    test_config = last_acq.get("test_config", {})
    
    return {
        "test_config": test_config,
        "acquisition_id": last_acq.get("id"),
        "start_time": last_acq.get("start_time")
    }


@app.get("/acquisitions/{acquisition_id}/file-info")
async def get_acquisition_file_info(acquisition_id: str):
    """Get file information including size before loading data for plotting.
    
    Returns metadata about the HDF5 file to help frontend decide if confirmation
    is needed before loading large files (> 2MB).
    """
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    path = data_file_path(acquisition_id)
    
    if not path.exists():
        return {
            "acquisition_id": acquisition_id,
            "file_exists": False,
            "message": "Data file not found"
        }
    
    # Get file size
    file_size_bytes = path.stat().st_size
    file_size_mb = file_size_bytes / (1024 * 1024)
    
    # Determine if confirmation is recommended (> 2MB)
    requires_confirmation = file_size_mb > 2.0
    
    return {
        "acquisition_id": acquisition_id,
        "file_exists": True,
        "file_size_bytes": file_size_bytes,
        "file_size_mb": round(file_size_mb, 2),
        "requires_confirmation": requires_confirmation,
        "samples": acq.get("samples", 0),
        "status": acq.get("status", "completed"),
        "message": "File is large, loading may take time. Proceed?" if requires_confirmation else "File ready to load"
    }


@app.get("/acquisitions/{acquisition_id}")
async def get_acquisition_data(acquisition_id: str):
    """Return numeric data for plotting and metadata including conditions."""
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    
    # Get body weight from test configuration (kg)
    body_weight_kg = None
    test_config = acq.get("test_config")
    if test_config:
        body_weight_kg = test_config.get("weight_kg")
    
    # Calculate body weight force in Newtons (weight_kg * 9.81 m/s²)
    body_weight_n = body_weight_kg * 9.81 if body_weight_kg else None
    
    # If HDF5 data file exists, read it
    path = data_file_path(acquisition_id)
    if path.exists():
        hdf5_data = read_hdf5_data(path)
        response_data = {
            "acquisition_id": acquisition_id,
            "status": acq.get("status", "completed"),
            "start_time": acq.get("start_time"),
            "samples": hdf5_data["samples"],
            "data": {},
            "conditions": acq.get("conditions", []),
            "comments": acq.get("comments", []),
            "body_weight_kg": body_weight_kg,
            "body_weight_n": body_weight_n
        }
        
        # Convert data from Newton to % of body weight if body weight is available
        if body_weight_n:
            # Add left data and timestamps if available (convert to %)
            if "left" in hdf5_data:
                left_percent = [(force / body_weight_n) * 100.0 for force in hdf5_data["left"]]
                response_data["data"]["left"] = left_percent
                response_data["data"]["ts_left"] = hdf5_data.get("ts_left", [])
            
            # Add right data and timestamps if available (convert to %)
            if "right" in hdf5_data:
                right_percent = [(force / body_weight_n) * 100.0 for force in hdf5_data["right"]]
                response_data["data"]["right"] = right_percent
                response_data["data"]["ts_right"] = hdf5_data.get("ts_right", [])
        else:
            # No body weight available, return raw Newton data
            if "left" in hdf5_data:
                response_data["data"]["left"] = hdf5_data["left"]
                response_data["data"]["ts_left"] = hdf5_data.get("ts_left", [])
            
            if "right" in hdf5_data:
                response_data["data"]["right"] = hdf5_data["right"]
                response_data["data"]["ts_right"] = hdf5_data.get("ts_right", [])
        
        return response_data
    
    # Fallback: generate mock data if HDF5 file doesn't exist
    num_samples = acq.get("samples", 1000)
    data = generate_mock_data(num_samples)
    return {
        "acquisition_id": acquisition_id,
        "status": acq.get("status", "completed"),
        "start_time": acq.get("start_time"),
        "samples": num_samples,
        "data": data,
        "conditions": acq.get("conditions", []),
        "comments": acq.get("comments", [])
    }


@app.get("/download/force/{acquisition_id}")
async def download_force_csv(acquisition_id: str):
    """Download force data as CSV: timestamp (ns epoch), left (N), right (N)"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    test_config = acq.get('test_config', {})
    subject_id = test_config.get('subject_id', 'unknown')
    session_id = test_config.get('session_id', 'unknown')
    acq_num = acquisition_id.replace('acq_', '')
    
    # Read HDF5 data directly to get absolute timestamps
    path = data_file_path(acquisition_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    # Read raw data with absolute timestamps in milliseconds
    try:
        with h5py.File(path, 'r') as f:
            has_left = '/tip_loadcell/force.left' in f or '/loadcell/left' in f
            has_right = '/tip_loadcell/force.right' in f or '/loadcell/right' in f
            has_ts_left = '/tip_loadcell/time.left' in f or '/loadcell/ts_left' in f
            has_ts_right = '/tip_loadcell/time.right' in f or '/loadcell/ts_right' in f
            
            if not has_left and not has_right:
                raise HTTPException(status_code=400, detail="No loadcell data found in HDF5 file")
            
            left_data = []
            right_data = []
            ts_left_ms = []
            ts_right_ms = []
            
            if has_left and has_ts_left:
                if '/tip_loadcell/force.left' in f and '/tip_loadcell/time.left' in f:
                    left_data = f['/tip_loadcell/force.left'][:].tolist()
                    ts_left_ms = f['/tip_loadcell/time.left'][:].tolist()  # milliseconds epoch
                else:
                    left_data = f['/loadcell/left'][:].tolist()
                    ts_left_ms = f['/loadcell/ts_left'][:].tolist()  # milliseconds epoch
            
            if has_right and has_ts_right:
                if '/tip_loadcell/force.right' in f and '/tip_loadcell/time.right' in f:
                    right_data = f['/tip_loadcell/force.right'][:].tolist()
                    ts_right_ms = f['/tip_loadcell/time.right'][:].tolist()  # milliseconds epoch
                else:
                    right_data = f['/loadcell/right'][:].tolist()
                    ts_right_ms = f['/loadcell/ts_right'][:].tolist()  # milliseconds epoch
            
            # Check if we have any data
            if not left_data and not right_data:
                raise HTTPException(status_code=400, detail="HDF5 file contains no force data")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read HDF5 file: {str(e)}")
    
    # Convert milliseconds to nanoseconds epoch - handle non-numeric timestamps
    ts_left_ns = []
    try:
        for ts in ts_left_ms:
            if isinstance(ts, (bytes, str)):
                ts_left_ns.append(0)
            else:
                ts_left_ns.append(int(float(ts) * 1_000_000))
    except (TypeError, ValueError):
        ts_left_ns = []
    
    ts_right_ns = []
    try:
        for ts in ts_right_ms:
            if isinstance(ts, (bytes, str)):
                ts_right_ns.append(0)
            else:
                ts_right_ns.append(int(float(ts) * 1_000_000))
    except (TypeError, ValueError):
        ts_right_ns = []
    
    # Synchronize data using linear interpolation on nanosecond timestamps
    def interpolate(x, x_data, y_data):
        """Linear interpolation"""
        if not x_data or not y_data:
            return None
        if x <= x_data[0]:
            return y_data[0]
        if x >= x_data[-1]:
            return y_data[-1]
        for i in range(len(x_data) - 1):
            if x_data[i] <= x <= x_data[i + 1]:
                t = (x - x_data[i]) / (x_data[i + 1] - x_data[i])
                return y_data[i] + t * (y_data[i + 1] - y_data[i])
        return None
    
    # Create unified timestamp array (in nanoseconds)
    all_ts_ns = sorted(set(ts_left_ns + ts_right_ns))
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['timestamp_ns', 'left_crutch_N', 'right_crutch_N'])
    
    for ts_ns in all_ts_ns:
        left_val = interpolate(ts_ns, ts_left_ns, left_data) if ts_left_ns and left_data else 0.0
        right_val = interpolate(ts_ns, ts_right_ns, right_data) if ts_right_ns and right_data else 0.0
        writer.writerow([ts_ns, f"{left_val:.2f}", f"{right_val:.2f}"])
    
    output.seek(0)
    
    filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_tip_force.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/download/info/{acquisition_id}")
async def download_info_csv(acquisition_id: str):
    """Download acquisition info as CSV"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    test_config = acq.get('test_config', {})
    subject_id = test_config.get('subject_id', 'unknown')
    session_id = test_config.get('session_id', 'unknown')
    acq_num = acquisition_id.replace('acq_', '')
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # General info
    writer.writerow(['Field', 'Value'])
    writer.writerow(['Acquisition ID', acquisition_id])
    writer.writerow(['Status', acq.get('status', '')])
    writer.writerow(['Start Time', acq.get('start_time', '')])
    writer.writerow(['End Time', acq.get('end_time', '')])
    writer.writerow(['Duration (s)', acq.get('duration', '')])
    writer.writerow(['Samples', acq.get('samples', '')])
    writer.writerow([])
    
    # Test configuration
    if test_config:
        writer.writerow(['Test Configuration'])
        writer.writerow(['Subject ID', test_config.get('subject_id', '')])
        writer.writerow(['Session ID', test_config.get('session_id', '')])
        writer.writerow(['Height (cm)', test_config.get('height_cm', '')])
        writer.writerow(['Weight (kg)', test_config.get('weight_kg', '')])
        writer.writerow(['Crutch Height', test_config.get('crutch_height', '')])
        writer.writerow([])
    
    # Comments
    comments = acq.get('comments', [])
    if comments:
        writer.writerow(['Comments'])
        writer.writerow(['Timestamp', 'Comment'])
        for comment in comments:
            # Handle both dict format and old string format
            if isinstance(comment, dict):
                writer.writerow([comment.get('timestamp', ''), comment.get('text', '')])
            else:
                # Legacy string format: "[timestamp] text"
                writer.writerow(['', str(comment)])
        writer.writerow([])
    
    # Conditions
    conditions = acq.get('conditions', [])
    if conditions:
        writer.writerow(['Conditions'])
        writer.writerow(['Timestamp', 'Condition'])
        for condition in conditions:
            writer.writerow([condition.get('timestamp', ''), condition.get('condition', '')])
    
    output.seek(0)
    
    filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_info.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/download/handle-force/{acquisition_id}")
async def download_handle_force_csv(acquisition_id: str):
    """Download handle force data as CSV: timestamp (ns epoch), left (N), right (N)"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    test_config = acq.get('test_config', {})
    subject_id = test_config.get('subject_id', 'unknown')
    session_id = test_config.get('session_id', 'unknown')
    acq_num = acquisition_id.replace('acq_', '')
    
    # Read HDF5 data
    path = data_file_path(acquisition_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    try:
        with h5py.File(path, 'r') as f:
            has_left = '/handle_loadcell/force.left' in f
            has_right = '/handle_loadcell/force.right' in f
            has_ts_left = '/handle_loadcell/time.left' in f
            has_ts_right = '/handle_loadcell/time.right' in f
            
            if not has_left and not has_right:
                raise HTTPException(status_code=400, detail="No handle_loadcell data found in HDF5 file")
            
            left_data = []
            right_data = []
            ts_left_ms = []
            ts_right_ms = []
            
            if has_left and has_ts_left:
                left_data = f['/handle_loadcell/force.left'][:].tolist()
                ts_left_ms = f['/handle_loadcell/time.left'][:].tolist()
            
            if has_right and has_ts_right:
                right_data = f['/handle_loadcell/force.right'][:].tolist()
                ts_right_ms = f['/handle_loadcell/time.right'][:].tolist()
            
            if not left_data and not right_data:
                raise HTTPException(status_code=400, detail="HDF5 file contains no handle force data")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read HDF5 file: {str(e)}")
    
    # Convert milliseconds to nanoseconds epoch - handle non-numeric timestamps
    ts_left_ns = []
    try:
        for ts in ts_left_ms:
            if isinstance(ts, (bytes, str)):
                ts_left_ns.append(0)
            else:
                ts_left_ns.append(int(float(ts) * 1_000_000))
    except (TypeError, ValueError):
        ts_left_ns = []
    
    ts_right_ns = []
    try:
        for ts in ts_right_ms:
            if isinstance(ts, (bytes, str)):
                ts_right_ns.append(0)
            else:
                ts_right_ns.append(int(float(ts) * 1_000_000))
    except (TypeError, ValueError):
        ts_right_ns = []
    
    # Synchronize data using linear interpolation
    def interpolate(x, x_data, y_data):
        """Linear interpolation"""
        if not x_data or not y_data:
            return None
        if x <= x_data[0]:
            return y_data[0]
        if x >= x_data[-1]:
            return y_data[-1]
        for i in range(len(x_data) - 1):
            if x_data[i] <= x <= x_data[i + 1]:
                t = (x - x_data[i]) / (x_data[i + 1] - x_data[i])
                return y_data[i] + t * (y_data[i + 1] - y_data[i])
        return None
    
    all_ts_ns = sorted(set(ts_left_ns + ts_right_ns))
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['timestamp_ns', 'left_handle_N', 'right_handle_N'])
    
    for ts_ns in all_ts_ns:
        left_val = interpolate(ts_ns, ts_left_ns, left_data) if ts_left_ns and left_data else 0.0
        right_val = interpolate(ts_ns, ts_right_ns, right_data) if ts_right_ns and right_data else 0.0
        writer.writerow([ts_ns, f"{left_val:.2f}", f"{right_val:.2f}"])
    
    output.seek(0)
    
    filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_handle_force.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/download/cardiac-frequency/{acquisition_id}")
async def download_cardiac_frequency_csv(acquisition_id: str):
    """Download cardiac frequency / PPG data as CSV"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    test_config = acq.get('test_config', {})
    subject_id = test_config.get('subject_id', 'unknown')
    session_id = test_config.get('session_id', 'unknown')
    acq_num = acquisition_id.replace('acq_', '')
    
    path = data_file_path(acquisition_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    try:
        with h5py.File(path, 'r') as f:
            # Try to find PPG data
            ppg_data = None
            ppg_ts = None
            
            if '/ppg' in f:
                if 'data' in f['/ppg']:
                    ppg_data = f['/ppg/data'][:].tolist()
                    if 'timestamp' in f['/ppg']:
                        ppg_ts = f['/ppg/timestamp'][:].tolist()
                    elif 'time' in f['/ppg']:
                        ppg_ts = f['/ppg/time'][:].tolist()
                else:
                    # /ppg is a group without 'data' key, find first dataset
                    ppg_group = f['/ppg']
                    dataset_keys = [k for k in ppg_group.keys() if isinstance(ppg_group[k], h5py.Dataset)]
                    if dataset_keys:
                        ppg_data = ppg_group[dataset_keys[0]][:].tolist()
                        # Try to find timestamps
                        for ts_name in ['timestamp', 'time', 'ts']:
                            if ts_name in ppg_group:
                                ppg_ts = ppg_group[ts_name][:].tolist()
                                break
            elif '/cardiac' in f:
                if 'data' in f['/cardiac']:
                    ppg_data = f['/cardiac/data'][:].tolist()
                    if 'timestamp' in f['/cardiac']:
                        ppg_ts = f['/cardiac/timestamp'][:].tolist()
                    elif 'time' in f['/cardiac']:
                        ppg_ts = f['/cardiac/time'][:].tolist()
                else:
                    # /cardiac is a group without 'data' key, find first dataset
                    cardiac_group = f['/cardiac']
                    dataset_keys = [k for k in cardiac_group.keys() if isinstance(cardiac_group[k], h5py.Dataset)]
                    if dataset_keys:
                        ppg_data = cardiac_group[dataset_keys[0]][:].tolist()
                        for ts_name in ['timestamp', 'time', 'ts']:
                            if ts_name in cardiac_group:
                                ppg_ts = cardiac_group[ts_name][:].tolist()
                                break
            
            if not ppg_data:
                raise HTTPException(status_code=400, detail="No PPG/cardiac data found in HDF5 file")
            
            if not ppg_ts:
                # Generate timestamps if not available
                ppg_ts = list(range(len(ppg_data)))
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Cardiac frequency error: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to read cardiac frequency data: {str(e)}")
    
    # Convert milliseconds to nanoseconds if needed - handle non-numeric timestamps
    ts_ns = []
    try:
        for i, ts in enumerate(ppg_ts):
            if isinstance(ts, (bytes, str)):
                ts_ns.append(i)
            else:
                try:
                    ts_val = float(ts)
                    if ts_val > 1e9:
                        ts_ns.append(int(ts_val * 1_000_000))
                    else:
                        ts_ns.append(int(ts_val * 1e6))
                except (TypeError, ValueError):
                    ts_ns.append(i)
    except Exception as e:
        print(f"[Cardiac] Timestamp conversion failed, using indices: {e}", file=sys.stderr)
        ts_ns = list(range(len(ppg_ts)))
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['timestamp_ns', 'ppg_value'])
    
    for ts, val in zip(ts_ns, ppg_data):
        writer.writerow([ts, f"{val:.2f}"])
    
    output.seek(0)
    
    filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_cardiac_frequency.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/download/eye-tracker/{acquisition_id}")
async def download_eye_tracker_csv(acquisition_id: str):
    """Download eye tracker / pupil_neon data as CSV with specific columns"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    test_config = acq.get('test_config', {})
    subject_id = test_config.get('subject_id', 'unknown')
    session_id = test_config.get('session_id', 'unknown')
    acq_num = acquisition_id.replace('acq_', '')
    
    path = data_file_path(acquisition_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    try:
        with h5py.File(path, 'r') as f:
            if '/pupil_neon' not in f:
                raise HTTPException(status_code=400, detail="No pupil_neon data found in HDF5 file")
            
            neon_group = f['/pupil_neon']
            print(f"[Eye tracker] /pupil_neon keys: {list(neon_group.keys())}", file=sys.stderr)
            
            # Required columns - in order
            required_cols = [
                "time_offset_ms_mean", "time_offset_ms_std", "time_offset_ms_median",
                "roundtrip_duration_ms_mean", "roundtrip_duration_ms_std", "roundtrip_duration_ms_median",
                "timestamp", "timecode"
            ]
            
            # Check which columns are available and read them
            available_cols = []
            col_data = {}
            
            for col in required_cols:
                if col in neon_group:
                    col_data[col] = neon_group[col][:].tolist()
                    available_cols.append(col)
                    print(f"[Eye tracker] Loaded {col}: {len(col_data[col])} samples", file=sys.stderr)
            
            if not available_cols:
                raise HTTPException(status_code=400, detail=f"No required columns found. Available: {list(neon_group.keys())}")
            
            # Find number of rows (should be same for all columns)
            num_rows = len(col_data[available_cols[0]]) if available_cols else 0
            print(f"[Eye tracker] Total rows: {num_rows}", file=sys.stderr)
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[Eye tracker ERROR] {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to read eye tracker data: {str(e)}")
    
    # Build CSV output
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(available_cols)
    
    # Write data rows
    for row_idx in range(num_rows):
        row_data = []
        for col in available_cols:
            val = col_data[col][row_idx]
            
            # Handle different data types
            if isinstance(val, (bytes, np.bytes_)):
                row_data.append(val.decode('utf-8', errors='ignore') if isinstance(val, bytes) else str(val))
            elif isinstance(val, (float, np.floating)):
                row_data.append(f"{val:.6f}")
            elif isinstance(val, (int, np.integer)):
                row_data.append(str(val))
            else:
                row_data.append(str(val))
        writer.writerow(row_data)
    
    output.seek(0)
    
    filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_eye_tracker.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/download/available-sensors/{acquisition_id}")
async def get_available_sensors(acquisition_id: str):
    """Get list of available sensors for an acquisition from HDF5 file"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    path = data_file_path(acquisition_id)
    
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    sensors = {"info": True}  # info is always available
    
    try:
        with h5py.File(path, 'r') as f:
            # Check for tip_loadcell
            if '/tip_loadcell/force.left' in f or '/tip_loadcell/force.right' in f or '/loadcell/left' in f or '/loadcell/right' in f:
                sensors["tip_force"] = True
            
            # Check for handle_loadcell
            if '/handle_loadcell/force.left' in f or '/handle_loadcell/force.right' in f:
                sensors["handle_force"] = True
            
            # Check for PPG (cardiac_frequency)
            if '/ppg' in f or '/cardiac' in f:
                sensors["cardiac_frequency"] = True
            
            # Check for eye_tracker (pupil_neon)
            if '/pupil_neon' in f or '/eye_tracker' in f:
                sensors["eye_tracker"] = True
    except Exception as e:
        print(f"Warning: Could not read HDF5 sensors: {e}", file=sys.stderr)
    
    return {"sensors": list(sensors.keys()), "acquisition_id": acquisition_id}


@app.get("/download/sensors/{acquisition_id}")
async def download_sensors_bundle(acquisition_id: str):
    """Download all available sensors. If total size > 10MB, returns ZIP. Otherwise returns JSON with individual download links."""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    test_config = acq.get('test_config', {})
    subject_id = test_config.get('subject_id', 'unknown')
    session_id = test_config.get('session_id', 'unknown')
    acq_num = acquisition_id.replace('acq_', '')
    
    path = data_file_path(acquisition_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    # Get available sensors
    sensors = {"info": True}
    try:
        with h5py.File(path, 'r') as f:
            if '/tip_loadcell/force.left' in f or '/tip_loadcell/force.right' in f or '/loadcell/left' in f or '/loadcell/right' in f:
                sensors["tip_force"] = True
            if '/handle_loadcell/force.left' in f or '/handle_loadcell/force.right' in f:
                sensors["handle_force"] = True
            if '/ppg' in f or '/cardiac' in f:
                sensors["cardiac_frequency"] = True
            if '/pupil_neon' in f or '/eye_tracker' in f:
                sensors["eye_tracker"] = True
    except Exception as e:
        print(f"Warning: Could not detect all sensors: {e}", file=sys.stderr)
    
    # Estimate total file size
    total_size_bytes = 0
    try:
        # Get HDF5 file size (rough estimate)
        if path.exists():
            total_size_bytes += path.stat().st_size
        else:
            total_size_bytes += 1_000_000  # Rough estimate of HDF5 size
    except:
        pass
    
    # If total size > 10MB (10485760 bytes), create ZIP
    size_threshold = 10 * 1024 * 1024  # 10MB
    
    if total_size_bytes > size_threshold:
        # Create ZIP with all available sensors
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            files_to_zip = []
            
            try:
                # Generate info CSV
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(['Field', 'Value'])
                writer.writerow(['Acquisition ID', acquisition_id])
                writer.writerow(['Status', acq.get('status', '')])
                writer.writerow(['Start Time', acq.get('start_time', '')])
                writer.writerow(['End Time', acq.get('end_time', '')])
                writer.writerow(['Duration (s)', acq.get('duration', '')])
                writer.writerow(['Samples', acq.get('samples', '')])
                writer.writerow([])
                
                if test_config:
                    writer.writerow(['Test Configuration'])
                    writer.writerow(['Subject ID', test_config.get('subject_id', '')])
                    writer.writerow(['Height (cm)', test_config.get('height_cm', '')])
                    writer.writerow(['Weight (kg)', test_config.get('weight_kg', '')])
                    writer.writerow(['Crutch Height', test_config.get('crutch_height', '')])
                    writer.writerow([])
                
                comments = acq.get('comments', [])
                if comments:
                    writer.writerow(['Comments'])
                    writer.writerow(['Timestamp', 'Comment'])
                    for comment in comments:
                        if isinstance(comment, dict):
                            writer.writerow([comment.get('timestamp', ''), comment.get('text', '')])
                        else:
                            writer.writerow(['', str(comment)])
                    writer.writerow([])
                
                conditions = acq.get('conditions', [])
                if conditions:
                    writer.writerow(['Conditions'])
                    writer.writerow(['Timestamp', 'Condition'])
                    for condition in conditions:
                        writer.writerow([condition.get('timestamp', ''), condition.get('condition', '')])
                
                info_filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_info.csv"
                info_path = tmpdir_path / info_filename
                info_path.write_text(output.getvalue())
                files_to_zip.append((info_filename, info_path))
                
                # Generate tip_force CSV if available
                if "tip_force" in sensors:
                    try:
                        with h5py.File(path, 'r') as f:
                            has_left = '/tip_loadcell/force.left' in f or '/loadcell/left' in f
                            has_right = '/tip_loadcell/force.right' in f or '/loadcell/right' in f
                            has_ts_left = '/tip_loadcell/time.left' in f or '/loadcell/ts_left' in f
                            has_ts_right = '/tip_loadcell/time.right' in f or '/loadcell/ts_right' in f
                            
                            left_data, right_data, ts_left_ms, ts_right_ms = [], [], [], []
                            
                            if has_left and has_ts_left:
                                if '/tip_loadcell/force.left' in f:
                                    left_data = f['/tip_loadcell/force.left'][:].tolist()
                                    ts_left_ms = f['/tip_loadcell/time.left'][:].tolist()
                                else:
                                    left_data = f['/loadcell/left'][:].tolist()
                                    ts_left_ms = f['/loadcell/ts_left'][:].tolist()
                            
                            if has_right and has_ts_right:
                                if '/tip_loadcell/force.right' in f:
                                    right_data = f['/tip_loadcell/force.right'][:].tolist()
                                    ts_right_ms = f['/tip_loadcell/time.right'][:].tolist()
                                else:
                                    right_data = f['/loadcell/right'][:].tolist()
                                    ts_right_ms = f['/loadcell/ts_right'][:].tolist()
                            
                            if left_data or right_data:
                                ts_left_ns = [int(ts * 1_000_000) for ts in ts_left_ms]
                                ts_right_ns = [int(ts * 1_000_000) for ts in ts_right_ms]
                                all_ts_ns = sorted(set(ts_left_ns + ts_right_ns))
                                
                                def interpolate(x, x_data, y_data):
                                    if not x_data or not y_data or x <= x_data[0]:
                                        return y_data[0] if y_data else 0.0
                                    if x >= x_data[-1]:
                                        return y_data[-1] if y_data else 0.0
                                    for i in range(len(x_data) - 1):
                                        if x_data[i] <= x <= x_data[i + 1]:
                                            t = (x - x_data[i]) / (x_data[i + 1] - x_data[i])
                                            return y_data[i] + t * (y_data[i + 1] - y_data[i])
                                    return 0.0
                                
                                output = io.StringIO()
                                writer = csv.writer(output)
                                writer.writerow(['timestamp_ns', 'left_crutch_N', 'right_crutch_N'])
                                
                                for ts_ns in all_ts_ns:
                                    left_val = interpolate(ts_ns, ts_left_ns, left_data) if ts_left_ns and left_data else 0.0
                                    right_val = interpolate(ts_ns, ts_right_ns, right_data) if ts_right_ns and right_data else 0.0
                                    writer.writerow([ts_ns, f"{left_val:.2f}", f"{right_val:.2f}"])
                                
                                force_filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}_tip_force.csv"
                                force_path = tmpdir_path / force_filename
                                force_path.write_text(output.getvalue())
                                files_to_zip.append((force_filename, force_path))
                    except Exception as e:
                        print(f"Warning: Could not generate tip_force CSV: {e}", file=sys.stderr)
                
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to prepare files: {str(e)}")
            
            # Create ZIP
            zip_filename = f"subject_{subject_id}_session_{session_id}_acq_{acq_num}.zip"
            zip_path = tmpdir_path / zip_filename
            
            try:
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for filename, filepath in files_to_zip:
                        zipf.write(filepath, arcname=filename)
                
                # Read ZIP file and return as streaming response
                zip_content = zip_path.read_bytes()
                return StreamingResponse(
                    iter([zip_content]),
                    media_type="application/zip",
                    headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {str(e)}")
    
    else:
        # Return list of available sensors to download individually
        return {
            "download_method": "individual",
            "acquisition_id": acquisition_id,
            "subject_id": subject_id,
            "session_id": session_id,
            "acq_num": acq_num,
            "sensors": list(sensors.keys()),
            "total_size_mb": total_size_bytes / (1024 * 1024),
            "message": "Download individual sensor files"
        }


@app.get("/status")
async def get_status():
    """Get recent status messages from error_handler"""
    global status_messages
    
    # Check for new messages
    check_status_messages()
    
    total_count = len(status_messages)
    recent_messages = status_messages[-20:] if total_count > 0 else []
    
    #print(f"/status endpoint called - returning {len(recent_messages)} recent messages out of {total_count} total")
    
    return {
        "messages": recent_messages,
        "total_count": total_count  # Global count for frontend tracking
    }


@app.get("/status/state")
async def get_status_state():
    """Get current status state organized by components.
    
    Returns categorized status for:
    - coordinator: Controller/Coordinator status
    - tip_loadcell_left: Left crutch tip loadcell status
    - tip_loadcell_right: Right crutch tip loadcell status
    - hdf5_writer: Data logger status
    - eye_tracker: Eye tracker status
    """
    global status_state
    
    # Check for new messages first
    check_status_messages()
    
    # Organize state by component type
    organized_state = {
        "coordinator": None,
        "tip_loadcell_left": None,
        "tip_loadcell_right": None,
        "hdf5_writer": None,
        "eye_tracker": None,
        "raw": status_state  # Include raw state for debugging
    }
    
    # Map status_state keys to organized categories
    for source_key, status_info in status_state.items():
        source_lower = source_key.lower()
        
        if "coordinator" in source_lower or "controller" in source_lower:
            organized_state["coordinator"] = status_info
        elif "tip_loadcell" in source_lower or "loadcell" in source_lower:
            if status_info.get("side") == "left":
                organized_state["tip_loadcell_left"] = status_info
            elif status_info.get("side") == "right":
                organized_state["tip_loadcell_right"] = status_info
        elif "hdf5" in source_lower:
            organized_state["hdf5_writer"] = status_info
        elif "eye_tracker" in source_lower or "pupil" in source_lower:
            organized_state["eye_tracker"] = status_info
    
    return organized_state


@app.post("/status/dismiss")
async def dismiss_status_message(body: dict):
    """Remove a status message from the buffer so it won't be re-sent."""
    global status_messages
    message_key = body.get("message_key")
    if not message_key:
        raise HTTPException(status_code=400, detail="message_key is required")

    before = len(status_messages)
    status_messages = [m for m in status_messages if build_status_message_key(m) != message_key]
    after = len(status_messages)
    return {
        "removed": before - after,
        "remaining": after
    }




if __name__ == "__main__":
    # Run on all interfaces, plain HTTP, port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
