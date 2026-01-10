"""
FastAPI backend for instrumented crutches acquisition system.
Designed for Raspberry Pi Zero 2 W - plain HTTP, no auth, maximum simplicity.
"""
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from datetime import datetime
import random
from pathlib import Path
import json
import h5py
import numpy as np
from dateutil import parser as date_parser

app = FastAPI(title="Instrumented Crutches")

# Data directory and index file
DATA_DIR = Path("data")
INDEX_FILE = DATA_DIR / "index.json"


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
            num = int(k.replace("acq_", ""))
            if num > max_num:
                max_num = num
        except Exception:
            continue
    return max_num + 1


def data_file_path(acq_id: str) -> Path:
    return DATA_DIR / f"{acq_id}.h5"


def read_hdf5_data(file_path: Path):
    """Read HDF5 file with loadcell data and convert timestamps to relative seconds."""
    try:
        with h5py.File(file_path, 'r') as f:
            # Read loadcell force data
            force_data = f['/loadcell/loadcell_x'][:]
            # Read timestamp strings
            timestamp_strings = f['/loadcell/timestamp'][:]
            
            # Decode timestamps if they are bytes
            if isinstance(timestamp_strings[0], bytes):
                timestamp_strings = [ts.decode('ascii') for ts in timestamp_strings]
            
            # Parse timestamps and convert to relative seconds
            timestamps_parsed = [date_parser.parse(ts) for ts in timestamp_strings]
            start_time = timestamps_parsed[0]
            relative_seconds = [(ts - start_time).total_seconds() for ts in timestamps_parsed]
            
            return {
                "timestamp": relative_seconds,
                "force": force_data.tolist(),
                "samples": len(force_data)
            }
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
                samples = len(f['/loadcell/loadcell_x'][:])
                acq["samples"] = samples
        except Exception:
            pass


# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Redirect to control page."""
    return FileResponse("static/control.html")


@app.post("/start")
async def start_acquisition():
    """Start a fake acquisition and return generated acquisition id."""
    global current_acquisition_id, next_id, acquisitions
    
    if current_acquisition_id is not None:
        return {
            "status": "error",
            "message": "Acquisition already running",
            "acquisition_id": current_acquisition_id
        }
    
    # Generate new acquisition id
    acquisition_id = f"acq_{next_id:04d}"
    next_id += 1
    
    # Create acquisition record
    acquisitions[acquisition_id] = {
        "id": acquisition_id,
        "start_time": datetime.now().isoformat(),
        "status": "running",
        "samples": 0
    }
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


@app.get("/acquisitions")
async def list_acquisitions():
    """Return list of available acquisition ids."""
    acquisition_list = [
        {
            "id": acq["id"],
            "start_time": acq["start_time"],
            "status": acq["status"],
            "samples": acq.get("samples", 0)
        }
        for acq in acquisitions.values()
    ]
    
    return {
        "acquisitions": acquisition_list,
        "count": len(acquisition_list),
        "current_acquisition": current_acquisition_id
    }


@app.get("/acquisitions/{acquisition_id}")
async def get_acquisition_data(acquisition_id: str):
    """Return mock numeric data for plotting."""
    if acquisition_id not in acquisitions:
        raise HTTPException(status_code=404, detail=f"Acquisition {acquisition_id} not found")
    
    acq = acquisitions[acquisition_id]
    
    # If HDF5 data file exists, read it
    path = data_file_path(acquisition_id)
    if path.exists():
        hdf5_data = read_hdf5_data(path)
        return {
            "acquisition_id": acquisition_id,
            "status": acq.get("status", "completed"),
            "start_time": acq.get("start_time"),
            "samples": hdf5_data["samples"],
            "data": {
                "timestamp": hdf5_data["timestamp"],
                "force": hdf5_data["force"]
            }
        }
    
    # Fallback: generate mock data if HDF5 file doesn't exist
    num_samples = acq.get("samples", 1000)
    data = generate_mock_data(num_samples)
    return {
        "acquisition_id": acquisition_id,
        "status": acq.get("status", "completed"),
        "start_time": acq.get("start_time"),
        "samples": num_samples,
        "data": data,
    }


if __name__ == "__main__":
    # Run on all interfaces, plain HTTP, port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
