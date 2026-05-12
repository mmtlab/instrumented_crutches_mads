# sync_handler plugin for MADS

This is a Filter plugin for [MADS](https://github.com/MADS-NET/MADS). 

<provide here some introductory info>

*Required MADS version: 2.0.0.*


## Supported platforms

Currently, the supported platforms are:

* **Debian** 


## Installation

Debian:

```bash
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build
sudo cmake --install build
```


## INI settings

The plugin supports the following settings in the INI file:

```ini
# execution command example:
# mads-filter sync_handler -o side=left -s tcp://10.42.0.1:9092
[sync_handler]
sub_topic = ["coordinator"]
pub_topic = "sync_handler"
health_status_period = 1000 # ms
queue_size = 1
```

All settings are optional; if omitted, the default values are used.

Operational constraints:

* `queue_size` must be set to `1`.
* The `-b` argument is not needed, because the synchronization check is only performed when a message is received from the `coordinator` topic.
* The NTP server and the `coordinator` must run on the same device, so the timestamp comparison is performed against a single local time source.




## Executable demo

<Explain what happens if the test executable is run>

---