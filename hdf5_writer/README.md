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


## INI settings example for Instrumented Crutches

The plugin supports the following settings in the INI file:

```ini
# execution command examples:
# mads-sink hdf5_writer.plugin 
[hdf5_writer]
sub_topic = ["command", "tip_loadcell", "handle_loadcell", "imu", "pupil_neon"]
folder_path = "../web_server/data"
keypath_sep = "."
keypaths = {"tip_loadcell" = ["force.right", "force.left"],
            "handle_loadcell" = ["force.right", "force.left"], 
            "imu" = ["ax.right", "ay.right", "az.right", "ax.left", "ay.left", "az.left", "gx.right", "gy.right", "gz.right", "gx.left", "gy.left", "gz.left", "mx.right", "my.right", "mz.right", "mx.left", "my.left", "mz.left"],
            "pupil_neon" = ["recording_id", "time_offset_ms_mean", "time_offset_ms_std", "time_offset_ms_median", "roundtrip_duration_ms_mean", "roundtrip_duration_ms_std", "roundtrip_duration_ms_median"]}
```

The keypaths `timecode`, `timestamp`, and `hostname` are always added to the list of keypaths, even if not specified in the INI file. Since `timecode` and `timestamp` are always logged, make sure that if you publish a message for one crutch, you also fill the other crutch's field with a NaN. This ensures that every row in the timestamp dataset has a corresponding row in the force dataset.



# HDF5 Tools

The install command also installs some of the HDf5 tools, notably:

* `h5ls`: lists the contents of an HDF5 file
* `h5watch`: watches an HDF5 file for changes
* `h5stat`: displays statistics about an HDF5 file

---