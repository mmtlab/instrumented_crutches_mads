# error_handler plugin for MADS

This is a Filter plugin for [MADS](https://github.com/MADS-NET/MADS). 

<provide here some introductory info>

*Required MADS version: 2.0.0.*


## Supported platforms

Currently, the supported platforms are:

* **Debian**
* **Windows**


## Installation

Debian:

```bash
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build
sudo cmake --install build
```

Windows:

```powershell
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build --config Release -t install
```


## INI settings

The plugin supports the following settings in the INI file:

```ini
# execution command example:
# mads-filter status_handler.plugin
[status_handler] 
sub_topic = ["agent_event", "coordinator", "hdf5_writer", "tip_loadcell", "handle_loadcell", "imu", "pupil_neon"] # add other relevant topics to monitor (startup events, error events and shutdown events from all agents are automatically published to "agent_event" topic)
pub_topic = "status"
unreachable_agent_timeout = 3000 # ms
debug = true
```

All settings are optional; if omitted, the default values are used.


---