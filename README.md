# Instrumented Crutches

A modular system for acquiring, processing, and visualizing force data from instrumented crutches using the MADS (Modular Acquisition and Data System) framework.

## Project Structure

- **controller**: Filter plugin for MADS that processes control commands
- **loadcell**: Filter plugin for MADS that reads and processes force sensor data from load cells
- **logger**: HDF5 sink plugin for MADS that stores acquired data in structured HDF5 format
- **web_server**: FastAPI-based web interface for real-time control, visualization, and data download

## Features

- Real-time force data acquisition from dual load cells
- HDF5-based data storage with hierarchical organization
- Web-based control interface and visualization dashboard
- Independent left/right crutch data handling with separate timestamps
- RESTful API for data access and device control

## Supported Modalities

- Single-crutch
- Both-crutch
- Standalone
- Remote-broker

## License

See individual component LICENSE files.

## TODO:
- **Real-time Error/Warning Feedback**: Implement handling of error and warning messages from nodes published to the `agent_event` topic. Add visualization of these messages in the web interface and implement corresponding controller logic to manage and display sensor/controller errors and warnings in real-time.
- **Supported modalities**: Implement handling of the different modalities

## DEBUG - Useful commands and settings 
List of commands:

BROKER
```powershell
mads-broker -n wlan0
```

CONTROLLER
```powershell
mads-filter controller.plugin
```

LOGGER
```powershell
sudo mads-sink hdf5_writer.plugin
```

LOADCELL
```powershell
mads-filter loadcell.plugin --dont-block -o side="left" -p10
```

WEB SERVER
```powershell
cd instrumented_crutches_mads/web_server/
source venv/bin/activate
python web_server.py
```

mads.ini
```powershell
[hdf5_writer]
sub_topic = ["command","loadcell"]
folder_path = "/home/crutch/instrumented_crutches_mads/web_server/data"
fallback_filename = "test.h5"
keypaths = {"loadcell" = ["ts_right","ts_left","right","left"]}
keypath_separator = "."

[loadcell]
sub_topic = ["command"]
pub_topic = "loadcell"
datapin = 6
clockpin = 26
scaling = 1.0
enabled = true

[controller]
sub_topic = ["ws_command","agent_event"]
pub_topic = "command"
period = 10
```