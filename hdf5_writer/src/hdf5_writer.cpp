/*
  _____ _ _ _                    _             _       
 |  ___(_) | |_ ___ _ __   _ __ | |_   _  __ _(_)_ __  
 | |_  | | | __/ _ \ '__| | '_ \| | | | |/ _` | | '_ \ 
 |  _| | | | ||  __/ |    | |_) | | |_| | (_| | | | | |
 |_|   |_|_|\__\___|_|    | .__/|_|\__,_|\__, |_|_| |_|
                          |_|            |___/         
# A Template for Hdf5Plugin, a Filter Plugin
# Hostname: unknown
# Current working directory: C:\mirrorworld\instrumented_crutches
# Creation date: 2026-02-21T10:44:53.619+0100
# NOTICE: MADS Version 2.0.0
*/
// Mandatory included headers
#include <filter.hpp>
#include <nlohmann/json.hpp>
#include <pugg/Kernel.h>

// other includes as needed here
#include <H5Cpp.h>
#include <sstream>
#include "json2hdf5.hpp"

// Define the name of the plugin
#ifndef PLUGIN_NAME
#define PLUGIN_NAME "hdf5"
#endif

// Load the namespaces
using namespace std;
using json = nlohmann::json;


// Plugin class. This shall be the only part that needs to be modified,
// implementing the actual functionality
class Hdf5Plugin : public Filter<json, json> {

public:

  ~Hdf5Plugin() {
    // Constructor implementation, if needed
    try {
      _converter.close();
    } catch (const H5::Exception &e) {
      _error = "idle: error closing HDF5 file: " + string(e.getDetailMsg());
    }
  }

  // Typically, no need to change this
  string kind() override { return PLUGIN_NAME; }

  // Implement the actual functionality here
  // Return types:
  // return_type::success: processing is valid, go to process
  // return_type::retry: skip processing go to next loop
  // return_type::warning: content of _error is tracked with register_event
  // return_type::error: _error is traced, skip process
  // return_type::critical: execution stops
  return_type load_data(json const &input, string topic = "") override {
    
    // if su_topic contains "command" field, process commands here
    if(input.contains("command")) {

      string action = input.value("command",""); // get the command, default to empty string if not found

      if (action == "start") {

        // firstly check if we are already recording, if yes, return a warning and do not start a new recording, to avoid overwriting the existing file or creating multiple files at the same time, which can lead to data loss or corruption
        if (_recording) {
          _error = "recording: start requested while already recording";
          return return_type::error;
        }

        // check if the command contains an "id" field, which is required to create a new file for recording, if not, return an error
        if (!input.contains("id")) {
          _error = "idle: start command requires an id";
          return return_type::error;
        }
        int id = input.value("id", -1); // get the id value, default to -1 if not found

        // Close any previously opened file, to ensure we start with a clean state, and to avoid potential issues with multiple open files or file locks, which can lead to data loss or corruption
        _converter.close();

        // Open a new file for recording
        string new_filename = "_acq_" + to_string(id) + ".h5";

        if (new_filename == _filename) {
          _filename = "not_handled_filename.h5"; // reset filename to avoid overwriting in case of new recording without restart
          _error = "idle: filename collision detected for id: " + to_string(id);
          return return_type::error;
        } else {
          _filename = new_filename;
        }

        try {
          _converter.open(_folder_path + _filename);
        } catch (const std::exception &e) {
          _error = "idle: error opening HDF5 file: " + string(e.what());
          return return_type::error;
        }
        _recording = true;
        std::cout << "Starting recording id: " << id << std::endl;

        // other actions as needed
      } else if (action == "stop") {

        // check if we are currently recording, if not, return a warning, to avoid potential issues with trying to close a file that is not open, which can lead to errors or crashes
        if (_recording == false) {
          _error = "idle: stop requested while not recording";
          return return_type::error;
        }

        try{
          _converter.close(); // Close the current file
        } catch (const H5::Exception &e) {
          _error = "recording: closing HDF5 file: " + string(e.getDetailMsg());
          return return_type::error;
        }

        // rename the file to indicate end of acquisition
        string new_filename = _filename.substr(1, _filename.size() - 1); // remove leading underscore
        if (std::rename((_folder_path + _filename).c_str(), (_folder_path + new_filename).c_str()) != 0) {
          _error = "recording: error renaming file " + _filename + " to " + new_filename;
          return return_type::error;
        }

        _recording = false;
        std::cout << "Stopping recording"<< std::endl;
        
      } 
        
    }

    if (topic == "coordinator") {
      // if the input contains a field that must be recorded, we need to continue
      // Otherwise we need to retry to avoid saving the default field (timecode, timestamp, hostname) 
      bool field_to_record_found = false;

      for (const auto &keypath : _converter.keypaths("coordinator")) {
        
        // skip default fields
        if (keypath == "timecode" || keypath == "timestamp" || keypath == "hostname") {
          continue; 
        }

        if (input.contains(keypath)) {
          field_to_record_found = true;
          break;;
        } 
      }

      if (!field_to_record_found) {
        return return_type::retry;
      }
    }

    // Continue if it is not a command, if we are recording
    if (_recording) {

      // check if the topic is in the keypaths, if not, return an error, to avoid potential issues
      if (std::find(_converter.groups().begin(), _converter.groups().end(), topic) == _converter.groups().end()) {
        _error = "recording: topic '" + topic + "' not found in keypaths.";
        return return_type::error;
      }

      // save the data to the file
      try {
        _converter.save_to_group(input, topic);
      } catch (const std::exception &e) {
        _error = "recording: error converting JSON to HDF5: " + string(e.what());
        return return_type::error;
      }
    }

    return return_type::success;
  }

  // We calculate the average of the last N values for each key and store it
  // into the output json object
  // Return types:
  // return_type::success: result is published
  // return_type::retry: don't publish, go to next loop
  // return_type::warning: content of _error is added to result befor publishing
  // return_type::error: _error is traced via register_event, don't publish
  // return_type::critical: execution stops
  return_type process(json &out) override {
    out.clear();

    // Send periodic agent_status if 500ms have passed
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - _last_health_status_time).count();
    
    if (elapsed >= _health_status_period) {
      out["agent_status"] = _recording ? "recording" : "idle";
      _last_health_status_time = now;
    }
    
    // This sets the agent_id field in the output json object, only when it is
    // not empty
    if (!_agent_id.empty()) out["agent_id"] = _agent_id;
    return return_type::success;
  }
  
  void set_params(const json &params) override {
    // Call the parent class method to set the common parameters 
    // (e.g. agent_id, etc.)
    Filter::set_params(params);

    // provide sensible defaults for the parameters by setting e.g.
    _params["keypath_sep"] = "."; // Default keypath separator
    _params["sensor"] = "unknown";
    _params["folder_path"] = "./fallback_data/";
    
    // then merge the defaults with the actually provided parameters
    // params needs to be cast to json
    _params.merge_patch(params);

    _health_status_period = _params.value("health_status_period", 500); // default to 500 ms
    
    _folder_path = _params.value("folder_path", "./fallback_data/");
    _folder_path += (_folder_path.back() == '/') ? "" : "/"; // Ensure trailing slash


    try {
      _converter.set_keypath_separator(_params["keypath_sep"].get<string>());
      for (const auto &group : _params["keypaths"].items()) {
        for (const auto &keypath : group.value()) {
          _converter.append_keypath(keypath.get<string>(), group.key());
        }
      }
    } catch (const std::exception &e) {
      _error = "Error setting keypaths: " + string(e.what());
      std::cerr << _error << std::endl;
      return;
    }
  
  }

  // Implement this method if you want to provide additional information
  map<string, string> info() override { 
    // return a map of strings with additional information about the plugin
    // it is used to print the information about the plugin when it is loaded
    // by the agent
    map<string, string> info_map;
    info_map["Folder path"] = _folder_path;
    stringstream ss;
    size_t total_keypaths = 0;
    for (const auto &group : _converter.groups()) {
      for (const auto &keypath : _converter.keypaths(group)) {
        ss << group << _converter.keypath_separator() << keypath << ", ";
      }
      total_keypaths += _converter.keypaths(group).size();
    }
    if (!ss.str().empty()) {
      ss.seekp(-2, ss.cur); // Remove the last comma and space
    }
    ss << " (total: " << total_keypaths << ")";
    info_map["Keypaths"] = ss.str();
    info_map["Keypath sep."] = _converter.keypath_separator();
    return info_map;
    
  };

private:
  // Define the fields that are used to store internal resources
  JsonToHdf5Converter _converter; // Converter for JSON to HDF5

  // settings variables
  string _folder_path = "";
  string _filename = "";

  // control variables
  bool _recording = false;
  
  int _health_status_period = 500;  // in milliseconds, default to 500 ms
  std::chrono::steady_clock::time_point _last_health_status_time = std::chrono::steady_clock::now();
};


/*
  ____  _             _             _      _
 |  _ \| |_   _  __ _(_)_ __     __| |_ __(_)_   _____ _ __
 | |_) | | | | |/ _` | | '_ \   / _` | '__| \ \ / / _ \ '__|
 |  __/| | |_| | (_| | | | | | | (_| | |  | |\ V /  __/ |
 |_|   |_|\__,_|\__, |_|_| |_|  \__,_|_|  |_| \_/ \___|_|
                |___/
Enable the class as plugin
*/
INSTALL_FILTER_DRIVER(Hdf5Plugin, json, json);


/*
                  _       
  _ __ ___   __ _(_)_ __  
 | '_ ` _ \ / _` | | '_ \ 
 | | | | | | (_| | | | | |
 |_| |_| |_|\__,_|_|_| |_|
                          
*/

int main(int argc, char const *argv[])
{
  Hdf5Plugin plugin;
  json params;
  json input, output;

  // Set example values to params
  params["test"] = "value";

  // Set the parameters
  plugin.set_params(params);

  // Set input data
  input["data"] = {
    {"AX", 1},
    {"AY", 2},
    {"AZ", 3}
  };

  // Set input data
  plugin.load_data(input);
  cout << "Input: " << input.dump(2) << endl;

  // Process data
  plugin.process(output);
  cout << "Output: " << output.dump(2) << endl;


  return 0;
}

