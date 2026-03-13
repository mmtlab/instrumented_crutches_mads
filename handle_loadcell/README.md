# handle_loadcell plugin for MADS

This is a Filter plugin for [MADS](https://github.com/MADS-NET/MADS). 

<provide here some introductory info>

*Required MADS version: 2.0.0.*


## Supported platforms

Currently, the supported platforms are:

* **Debian** 
* **Windows (debug)**


## Installation

Debian:

```bash
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build
sudo cmake --install build
```

Windows:

```powershell
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"  -DRASPBERRYPI_PLATFORM=OFF
cmake --build build --config Release -t install
```


## INI settings

The plugin supports the following settings in the INI file:

```ini
# execution command example:
# mads-filter handle_loadcell -o side=left --dont-block
[handle_loadcell]
sub_topic = ["coordinator"] # power_status is used to adapt the ADC's reference voltage in realtime reading from the "supply_voltage" field
pub_topic = "handle_loadcell"
period = 20
ref_voltage = 4.12
adc1_rate = 9 # ADS1263 rate index, default 9 = 1200 SPS, but raspberry can reach maximum 100Hz
side = "unknown" # used to select scaling factors
health_status_period = 500 # ms
# Adjust the input number with the connected loadcell's label
# Default is:
#  IN0, IN1, IN2, IN3, IN4, IN5, IN6, IN7 
# "up_front", "up_back", "right_front", "right_back", "left_front", "left_back","down_front", "down_back"
input_map = [[0, "up_front"], [1, "up_back"], [2, "right_front"], [3, "right_back"], [4, "left_front"], [5, "left_back"], [6, "down_front"], [7, "down_back"]]

[handle_loadcell.range_map]
left = [[0, 500.0], [1, 500.0], [2, 50.0], [3, 50.0], [4, 50.0], [5, 50.0], [6, 50.0], [7, 50.0]] # IN0, IN1, IN2, IN3, IN4, IN5, IN6, IN7
right = [[0, 500.0], [1, 500.0], [2, 50.0], [3, 50.0], [4, 50.0], [5, 50.0], [6, 50.0], [7, 50.0]] # IN0, IN1, IN2, IN3, IN4, IN5, IN6, IN7
```

All settings are optional; if omitted, the default values are used.

When `health_status_period` elapses, the plugin also publishes a `perf` block with:

- `adc_read_ms`: time spent in `ADS1263_GetAll(...)`
- `process_ms`: duration of a full `process()` call
- `cycle_ms`: time between successive completed `process()` calls
- `adc1_rate`: configured ADS1263 data rate index
- `channels`: number of channels read each cycle




## Executable demo

<Explain what happens if the test executable is run>

---