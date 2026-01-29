"""
FastAPI backend for instrumented crutches acquisition system.
Designed for Raspberry Pi Zero 2 W - plain HTTP, no auth, maximum simplicity.
"""
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import asyncio
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

# Initialize MADS agent
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, 'python'))

from mads_agent import Agent, EventType, MessageType, mads_version, mads_default_settings_uri

# Global MADS agent instance
mads_agent = None
status_messages = []  # Buffer for status messages from error_handler
status_task = None
status_task_stop = None

app = FastAPI(title="Instrumented Crutches")

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
    global mads_agent, status_messages
    if not mads_agent:
        return
    
    try:
        msg_type = mads_agent.receive()
        if msg_type != MessageType.NONE:
            topic, message = mads_agent.last_message()
            
            print(f"Received message on topic '{topic}': {message}")
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
                    
                status_messages.append(payload)
                print(f"✓ Status message added to buffer. Total messages: {len(status_messages)}")
                print(f"✓ Payload: {payload}")
                # Keep only last 100 messages
                if len(status_messages) > 100:
                    status_messages.pop(0)
    except Exception as e:
        print(f"Error receiving status message: {e}", file=sys.stderr)


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


def send_bridge_command(command: str, acq_id: str = None):
    """Send command via MADS agent to ws_command topic"""
    global mads_agent
    
    if not mads_agent:
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
        mads_agent.publish(topic, payload_dict)
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


async def send_bridge_command_async(command: str, acq_id: str = None):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, send_bridge_command, command, acq_id)


def read_hdf5_data(file_path: Path):
    """Read HDF5 file with loadcell data and convert timestamps to relative seconds."""
    try:
        with h5py.File(file_path, 'r') as f:
            result = {}
            
            # Check which datasets are available
            has_left = '/loadcell/left' in f
            has_right = '/loadcell/right' in f
            has_ts_left = '/loadcell/ts_left' in f
            has_ts_right = '/loadcell/ts_right' in f
            
            if not has_left and not has_right:
                raise HTTPException(status_code=500, detail="No loadcell data found in HDF5 file")
            
            start_time_ms = None
            
            # Read left crutch data and timestamps if available
            if has_left and has_ts_left:
                left_data = f['/loadcell/left'][:]
                ts_left_ms = f['/loadcell/ts_left'][:]  # milliseconds epoch
                
                # Convert to seconds and make relative
                if start_time_ms is None:
                    start_time_ms = ts_left_ms[0]
                ts_left_relative = [(ts - start_time_ms) / 1000.0 for ts in ts_left_ms]
                
                result["left"] = left_data.tolist()
                result["ts_left"] = ts_left_relative
            
            # Read right crutch data and timestamps if available
            if has_right and has_ts_right:
                right_data = f['/loadcell/right'][:]
                ts_right_ms = f['/loadcell/ts_right'][:]  # milliseconds epoch
                
                # Convert to seconds and make relative
                if start_time_ms is None:
                    start_time_ms = ts_right_ms[0]
                ts_right_relative = [(ts - start_time_ms) / 1000.0 for ts in ts_right_ms]
                
                result["right"] = right_data.tolist()
                result["ts_right"] = ts_right_relative
            
            # Calculate total samples
            total_samples = 0
            if "left" in result:
                total_samples += len(result["left"])
            if "right" in result:
                total_samples += len(result["right"])
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
                if '/loadcell/timestamp' in f:
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
    global current_acquisition_id, next_id, acquisitions
    
    if current_acquisition_id is not None:
        return {
            "status": "error",
            "message": "Acquisition already running",
            "acquisition_id": current_acquisition_id
        }
    
    # Generate new acquisition id
    acquisition_id = f"acq_{next_id}"
    next_id += 1
    
    success, bridge_output = await send_bridge_command_async("start", acquisition_id)
    if not success:
        return {
            "status": "error",
            "message": f"Bridge start failed: {bridge_output}"
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
            "patient": test_config.get("patient"),
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
    
    success, bridge_output = await send_bridge_command_async("stop", current_acquisition_id)
    if not success:
        return {
            "status": "error",
            "message": f"Bridge stop failed: {bridge_output}"
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
    """Send set_offset command via bridge."""
    try:
        success, bridge_output = await send_bridge_command_async("set_offset")
        if not success:
            return {
                "status": "error",
                "message": f"Bridge command failed: {bridge_output}"
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
    global acquisitions, current_acquisition_id
    
    condition = condition_data.get("condition", "").strip()
    if not condition:
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
    
    # Add condition with timestamp
    timestamp = datetime.now().isoformat()
    condition_entry = {
        "timestamp": timestamp,
        "condition": condition
    }
    
    if "conditions" not in acquisitions[target_acq_id]:
        acquisitions[target_acq_id]["conditions"] = []
    
    acquisitions[target_acq_id]["conditions"].append(condition_entry)
    save_index(acquisitions)
    
    return {
        "status": "success",
        "message": f"Condition '{condition}' saved to {target_acq_id}",
        "acquisition_id": target_acq_id
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
    
    # Read HDF5 data directly to get absolute timestamps
    path = data_file_path(acquisition_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found for {acquisition_id}")
    
    # Read raw data with absolute timestamps in milliseconds
    try:
        with h5py.File(path, 'r') as f:
            has_left = '/loadcell/left' in f
            has_right = '/loadcell/right' in f
            has_ts_left = '/loadcell/ts_left' in f
            has_ts_right = '/loadcell/ts_right' in f
            
            if not has_left and not has_right:
                raise HTTPException(status_code=400, detail="No loadcell data found in HDF5 file")
            
            left_data = []
            right_data = []
            ts_left_ms = []
            ts_right_ms = []
            
            if has_left and has_ts_left:
                left_data = f['/loadcell/left'][:].tolist()
                ts_left_ms = f['/loadcell/ts_left'][:].tolist()  # milliseconds epoch
            
            if has_right and has_ts_right:
                right_data = f['/loadcell/right'][:].tolist()
                ts_right_ms = f['/loadcell/ts_right'][:].tolist()  # milliseconds epoch
            
            # Check if we have any data
            if not left_data and not right_data:
                raise HTTPException(status_code=400, detail="HDF5 file contains no force data")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read HDF5 file: {str(e)}")
    
    # Convert milliseconds to nanoseconds epoch
    ts_left_ns = [int(ts * 1_000_000) for ts in ts_left_ms]
    ts_right_ns = [int(ts * 1_000_000) for ts in ts_right_ms]
    
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
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=force_{acquisition_id}.csv"}
    )


@app.get("/download/info/{acquisition_id}")
async def download_info_csv(acquisition_id: str):
    """Download acquisition info as CSV"""
    acquisitions = load_index()
    
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    
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
    test_config = acq.get('test_config', {})
    if test_config:
        writer.writerow(['Test Configuration'])
        writer.writerow(['Patient', test_config.get('patient', '')])
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
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=info_{acquisition_id}.csv"}
    )


@app.get("/status")
async def get_status():
    """Get recent status messages from error_handler"""
    global status_messages
    
    # Check for new messages
    check_status_messages()
    
    print(f"📤 /status endpoint called - returning {len(status_messages)} messages (last 20)")
    
    return {
        "messages": status_messages[-20:],  # Return last 20 messages
        "count": len(status_messages)
    }


@app.on_event("startup")
async def startup_event():
    """Initialize MADS agent on startup"""
    global status_task
    success = init_mads_agent()
    if success:
        print("✓ MADS agent connected successfully")
        status_task = asyncio.create_task(status_polling_loop())
    else:
        print("✗ Failed to initialize MADS agent - commands will fail", file=sys.stderr)


@app.on_event("shutdown")
async def shutdown_event():
    """Disconnect MADS agent on shutdown"""
    global mads_agent, status_task, status_task_stop
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


if __name__ == "__main__":
    # Run on all interfaces, plain HTTP, port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
