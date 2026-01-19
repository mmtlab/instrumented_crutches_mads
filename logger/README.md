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

* **Linux** 
* **MacOS**
* **Windows**


## Installation

Linux and MacOS:

```bash
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build -j4
sudo cmake --install build
```

**NOTE**: on some cmake versions on Linux, parallel builds may not work as expected. If you encounter issues, try building without the `-j4` flag.


Windows:

```powershell
cmake -Bbuild -DCMAKE_INSTALL_PREFIX="$(mads -p)"
cmake --build build --config Release
cmake --install build --config Release
```


## INI settings

The plugin supports the following settings in the INI file:

```ini
[hdf5_writer]
sub_topic = ["topic1", "topic2"]
filename = "/path/to/file.h5"
keypaths = {"topic1":["key1","key2.subkey1","key3"], "topic2":["key2.subkey2"]}
keypath_separator = "."
```

All settings are optional; if omitted, the default values are used. The keypaths `timecode`, `timestamp`, and `hostname` are always added to the list of keypaths, even if not specified in the INI file.


## Executable demo

The demo executable creates a `validation_test.h5` file, appending the same data to it every time it is executed.

# HDF5 Tools

The install command also installs some of the HDf5 tools, notably:

* `h5ls`: lists the contents of an HDF5 file
* `h5watch`: watches an HDF5 file for changes
* `h5stat`: displays statistics about an HDF5 file

---