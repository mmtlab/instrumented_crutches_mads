# hdf5 plugin for MADS

This is a Sink plugin for [MADS](https://github.com/MADS-NET/MADS). 

This plugin saves the incoming data into a [HDF5](https://www.hdfgroup.org/solutions/hdf5/) file. It is designed to work with the MADS framework, allowing users to store data in a structured format that is efficient for both storage and retrieval.

Data are stored in a hierarchical structure, similar to a filesystem, which allows for easy organization and access. The plugin supports various data types and can handle large datasets efficiently.

Data are stored in **groups** and **datasets**. Each group can contain multiple datasets. Each MADS topic is stored in a separate group. Withion the group, only the data within a given *keypath* is stored, by appending.

Suppose that the incoming data contains the following key-value pairs:

```json
{
  "key1": "value1",
  "key2": {
    "subkey1": 10,
    "subkey2": [1.0, 2.3, 3.7]
  },
  "key3": "value4"
}
```

and we specify that the followings keypaths are to be stored:

```ini
keypaths = ["key1", "key2.subkey1", "key2.subkey2", "key3"]
```

then the dataset `key1` will contain a column vector of strings, the dataset `key2.subkey1` will contain a column vector of integers, the dataset `key2.subkey2` will contain a table of doubles, and the dataset `key3` will contain a column vector of strings.

The keypath separator is `.` by default, but it can be changed in the INI file (note that `/` is not a valid separator).


*Required MADS version: 1.3.1.*


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


Windows (debug):

```powershell
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build --config Release -t install
```


## INI settings for Instrumented Crutches

The plugin supports the following settings in the INI file:

```ini
[hdf5_writer]
sub_topic = ["command", "tip_loadcell", "handle_loadcell", "imu"]
folder_path = "../web_server/data"
keypath_sep = "."
sensor = "unknown" # used to select suffix_filename and keypaths

[hdf5_writer.suffix_filename]
tip_loadcell = "tip_loadcell"
handle_loadcell = "handle_loadcell"
imu = "imu"

[hdf5_writer.keypaths]
tip_loadcell = {"tip_loadcell" = ["ts_right", "ts_left", "right", "left"]}
handle_loadcell = {"handle_loadcell" = ["ts_right", "ts_left", "right", "left"]} # update with actual keypaths from handle_loadcell agent (2 upper loadcells + 2 lower loadcells + 2 left loadcells + 2 right loadcells)
imu = {"imu" = ["ts_right", "ts_left", "ax_right", "ay_right", "az_right", "ax_left", "ay_left", "az_left", "gx_right", "gy_right", "gz_right", "gx_left", "gy_left", "gz_left", "mx_right", "my_right", "mz_right", "mx_left", "my_left", "mz_left"]}
```

The keypaths `timecode`, `timestamp`, and `hostname` are always added to the list of keypaths, even if not specified in the INI file.

The `suffix_filename` and `sensor` settings are required. The `sensor` value is used by the plugin to select two related configuration entries: the filename suffix (defined in `[hdf5_writer.suffix_filename]`) and the list of keypaths to store (defined in `[hdf5_writer.keypaths]`). To add a new sensor:

- Add the sensor name as a key under `[hdf5_writer.suffix_filename]` and set the desired file suffix.
- Add the same sensor name under `[hdf5_writer.keypaths]` and provide the list of keypaths (fields) to be saved for that sensor.
- If the sensor publishes on a sub-topic, make sure that sub-topic is present in `sub_topic` as well.

The plugin will automatically look up the entries for the configured `sensor` in both `suffix_filename` and `keypaths` and use the specified keypaths to create the HDF5 datasets. The keypaths `timecode`, `timestamp`, and `hostname` are added automatically even if not listed in the INI file.

To run the logger for a specific sensor, override the `sensor` setting at runtime using the `-o` option. For example, to run the `imu` sensor logger:

```bash
mads-sink hdf5_writer.plugin -o sensor=imu
```

# HDF5 Tools

The install command also installs some of the HDf5 tools, notably:

* `h5ls`: lists the contents of an HDF5 file
* `h5watch`: watches an HDF5 file for changes
* `h5stat`: displays statistics about an HDF5 file

---