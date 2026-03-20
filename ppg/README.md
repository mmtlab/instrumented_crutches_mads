# UPS HAT for MADS

This is a Python agent for [MADS](https://github.com/MADS-NET/MADS). 

The source code to acquire from the MAX 30100 has been get from https://github.com/mfitzp/max30100.git


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
python ppg.py
```

Add `-s tcp:\\<broker-ip>:9092` to connect to a remote broker (default is `tcp:\\localhost:9092`).

## INI settings

The plugin supports the following settings in the INI file:

```ini
[ppg]
sub_topic = ["coordinator"]
pub_topic = "ppg"
health_status_period = 500 # ms
period = 10 # ms, 100 Hz
side = "unknown"
```

All settings are optional; if omitted, the default values are used.


---