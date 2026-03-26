# Instrumented Crutches

This repository contains an instrumented crutches system built on top of [MADS](https://github.com/pbosetti/MADS) (Multi-Agent Distributed System). 

**MADS** is a flexible, plugin-based framework for real-time data acquisition, processing, and distribution. It provides a modular architecture where different components (sources, filters, sinks) can be easily composed to create data processing pipelines. The system uses a publish/subscribe messaging pattern for inter-component communication and supports distributed deployments.

This project implements MADS plugins for collecting and processing data from instrumented crutches, including tip load cells, eye tracking, and coordination between multiple sensors. For more information about MADS, visit the [official documentation](https://mads-net.github.io/).

*Required MADS version: [2.0.0](https://github.com/pbosetti/MADS/releases/tag/v2.0.0)*

## Installation

First, clone the repository:

```bash
git clone https://github.com/mmtlab/instrumented_crutches_mads.git
cd instrumented_crutches_mads
```

Each agent must be installed separately. See the `README.md` files inside each agent folder for details. 

**Important note**: Not all agents are required on both crutches. Compile only the agents needed for each crutch role:

- **Master crutch** (i.e. right): web_server, coordinator, status_handler, hdf5_writer, tip_loadcell, eye_tracker, ups, ppg
- **Slave crutch** (i.e. left): tip_loadcell, ups, ppg

### Settings file - mads.ini
Check the `mads.ini` configuration (i.e. the tip load cells' scaling factors) and run this command from the repository root if you want to overwrite the existing file:

```bash
sudo cp templates/mads.ini /usr/local/etc/
```

### Enable services

Enable services according to the crutch role.

On the master crutch (i.e. right crutch), copy the service files to `/etc/systemd/system`:

```bash
sudo cp templates/mads-broker.service templates/mads-web_server.service templates/mads-coordinator.service templates/mads-status_handler.service templates/mads-hdf5_writer.service templates/mads-eye_tracker.service templates/mads-network_handler.service templates/right/mads-tip_loadcell.service templates/right/mads-ups.service templates/right/mads-ppg.service /etc/systemd/system/
```

Then enable them:

```bash
sudo systemctl enable mads-broker.service mads-web_server.service mads-coordinator.service mads-status_handler.service mads-hdf5_writer.service mads-tip_loadcell.service mads-eye_tracker.service mads-network_handler.service mads-ups.service mads-ppg.service
```

On the slave crutch (i.e. left crutch), copy the service file to `/etc/systemd/system`:

```bash
sudo cp templates/left/mads-tip_loadcell.service templates/left/mads-ups.service templates/left/mads-ppg.service /etc/systemd/system/
```

Then enable it:

```bash
sudo systemctl enable mads-tip_loadcell.service mads-ups.service mads-ppg.service
```

Use the pre-configured service files in `templates/left` and `templates/right` for the correct crutch side.

For the Python agent, check the paths in the service file and adapt them to the current configuration.

All enabled services start their agents automatically at boot.


### Configure network

On the master crutch Raspberry Pi, create a Wi-Fi hotspot:

```bash
sudo nmcli device wifi hotspot ssid <network-name> password <network-password>
```

On the slave crutch Raspberry Pi, configure the connection to that hotspot and enable auto-connect:

```bash
sudo nmcli connection modify <connection-name> connection.autoconnect yes
sudo nmcli connection up <connection-name>
```


### Configure NTP synchronization

Install chrony by running:

```bash
sudo apt install chrony
```

Copy the configuration file to `/etc/chrony`:

```bash
sudo cp templates/chrony.conf /etc/chrony/
```

Enable and restart the service:

```bash
sudo systemctl enable chrony
sudo systemctl restart chrony
```

Run this NTP configuration on both crutches.

***Important note***: the NTP configuration file (`chrony.conf`) uses `10.42.0.1` as the default server IP.
Check the master crutch hotspot IP address and update the file accordingly before copying it to `/etc/chrony/`.


## Acquisition board case
You can find the acquisition board case STL files in the `templates/case` folder for 3D printing.