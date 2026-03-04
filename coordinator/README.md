# coordinator plugin for MADS

This is a Filter plugin for [MADS](https://github.com/pbosetti/MADS). 

*Required MADS version: 2.0.0.*


## Supported platforms

Currently, the supported platforms are:

* **Debian** 
* **Windows (debug only)**


## Installation

Debian:

```bash
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build
sudo cmake --install build
```

Windows (debug only):

```powershell
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build --config Release -t install
```

## INI settings

The plugin supports the following settings in the INI file:

```ini
# execution command example:
# mads-filter coordinator -b
[coordinator]
sub_topic = ["ws_command"]
pub_topic = "coordinator"
period = 10
health_status_period = 500 # ms
```

**Note**: This agent must run in non-blocking mode. Use the `-b` or `--dont-block` argument when running it.

---