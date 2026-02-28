# controller plugin for MADS

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
# mads-filter coordinator.plugin
[coordinator]
sub_topic = ["ws_command"]
pub_topic = "coordinator"
period = 10
health_status_period = 500 # ms
```

All settings are optional; if omitted, the default values are used.

---