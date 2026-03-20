# UPS for MADS

This is a Python agent for [MADS](https://github.com/MADS-NET/MADS). 

<provide here some introductory info>

*Required MADS version: 2.0.0.*


## Supported platforms

Currently, the supported platforms are:

* **Debian / Raspberry Pi OS (I2C required)**


## Setup

```bash
# Enable I2C on Raspberry Pi first (raspi-config -> Interface Options -> I2C)

# System packages (Raspberry Pi / Debian)
sudo apt-get update
sudo apt-get install -y python3-pip python3-smbus i2c-tools

# Create and activate venv (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**Dependencies:**
- smbus (provided by `python3-smbus`) or `smbus2` via pip fallback

## Run

```bash
python ups.py
```

Add `-s tcp:\\<broker-ip>:9092` to connect to a remote broker (default is `tcp:\\localhost:9092`).

The agent connects to MADS broker and publishes every `health_status_period` ms on `pub_topic`.
Each published message contains:

- `voltage`
- `current`
- `power`
- `percent`
- `remaining_battery_time`

`remaining_battery_time` is estimated with a linear fit over the last 60 seconds of battery percentage history, and is expressed in seconds. If the trend is flat/rising, the value is `null`.

## INI settings

The plugin supports the following settings in the INI file:

```ini
[ups]
pub_topic = "ups"
health_status_period = 500 # ms
i2c_bus = 1
i2c_address = 67 # decimal for 0x43
battery_empty_voltage = 3.0
battery_full_voltage = 4.2
```

`health_status_period` controls the publish period. Battery percentage and remaining time use `battery_empty_voltage` and `battery_full_voltage` for normalization.

All settings are optional; if omitted, the default values are used.


## Executable demo

<Explain what happens if the test executable is run>

---