# loadcell plugin for MADS

This is a Filter plugin for [MADS](https://github.com/pbosetti/MADS). 

<provide here some introductory info>

*Required MADS version: [2.0.0](https://github.com/pbosetti/MADS/releases/tag/v2.0.0)*


## Supported platforms

Currently, the supported platforms are:

* **Debian** 
* **Windows**


## Installation

Install the HX711's library ([HX711](https://github.com/mrcghidelli/hx711.git))

```bash
sudo apt-get install -y liblgpio-dev

git clone https://github.com/mrcghidelli/hx711.git
cd hx711

make && sudo make install
```
You may need to run ldconfig at this point if you attempt to compile a program and libhx711 is not found.

Then install the MADS agent.

Raspberry:

```bash
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build
sudo cmake --install build
```

Windows (debug and develop):

```powershell
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)" -DRASPBERRYPI_PLATFORM=OFF
cmake --build build --config Release -t install
```


## INI settings

The plugin supports the following settings in the INI file:

```ini
# execution command example:
# mads-filter tip_loadcell.plugin -o side=left --dont-block
[tip_loadcell]
sub_topic = ["coordinator"]
pub_topic = "tip_loadcell"
datapin = 6
clockpin = 26
period = 10
side = "unknown" # used to select scaling factor
health_status_period = 500 # ms

[tip_loadcell.scaling]
left = 1.0 # debug value
right = 1.2 # debug value

```

All settings are optional; if omitted, the default values are used.


## Executable demo

<Explain what happens if the test executable is run>

---