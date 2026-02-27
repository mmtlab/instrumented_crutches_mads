/*
      _ ____   ___  _   _   _          _   _ ____  _____ ____
     | / ___| / _ \| \ | | | |_ ___   | | | |  _ \|  ___| ___|
  _  | \___ \| | | |  \| | | __/ _ \  | |_| | | | | |_  |___ \
 | |_| |___) | |_| | |\  | | || (_) | |  _  | |_| |  _|  ___) |
  \___/|____/ \___/|_| \_|  \__\___/  |_| |_|____/|_|   |____/
Convert JSON files to HDF5 format using nlohmann and HDF5 library
*/

#ifndef JSON2HDF5_HPP
#define JSON2HDF5_HPP

#include <H5Cpp.h>
#include <map>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <string>
#include <vector>

class JsonToHdf5Converter {
public:
  // Constructors
  JsonToHdf5Converter() {
    H5Eset_auto2(H5E_DEFAULT, nullptr, nullptr); // Disable error auto-printing
    // _keypaths = {"timecode", "timestamp", "hostname"};
  }

  JsonToHdf5Converter(const std::string &filename) : JsonToHdf5Converter() {
    open(filename);
  }

  ~JsonToHdf5Converter() { close(); }

  void open(const std::string &filename) {
    // Open the HDF5 file
    try {
      _file = H5::H5File(filename, H5F_ACC_EXCL);
    } catch (const H5::FileIException &e) {
      try {
        _file = H5::H5File(filename, H5F_ACC_RDWR);
      } catch (const H5::FileIException &e) {
        throw std::runtime_error("Cannot open file (is it open already?): " +
                                 e.getDetailMsg());
      }
    } catch (const H5::Exception &e) {
      throw std::runtime_error("HDF5 exception: " + e.getDetailMsg());
    }
  }

  // Method to convert JSON to HDF5
  void save_to_group(const nlohmann::json &json_data,
                     const std::string &group_name) {
    // Convert JSON data to HDF5 format
    nlohmann::json j;
    if (group_name.empty()) {
      throw std::invalid_argument("Group name cannot be empty.");
    }
    for (const auto &item : _keypaths[group_name]) {
      j = json_from_keypath(json_data, item);
      if (j != nullptr) {
        write_to_dataset(j, item, group_name);
      }
    }
  }

  void write_to_dataset(const nlohmann::json &data,
                        const std::string &dataset_name,
                        const std::string &group_name) {
    H5::Group group;
    try {
      try {
        group = _file.openGroup(group_name);
      } catch (const H5::FileIException &e) {
        group = _file.createGroup(group_name);
      }
      // Check if dataset exists
      bool dataset_exists = false;
      try {
        H5::DataSet dataset = group.openDataSet(dataset_name);
        dataset_exists = true;
        dataset.close();
      } catch (const H5::FileIException &) {
        dataset_exists = false;
      } catch (const H5::GroupIException &) {
        dataset_exists = false;
      }

      if (!dataset_exists) {
        // Create new dataset based on data type
        create_dataset(dataset_name, group, data);
      } else {
        // Append to existing dataset
        append_to_dataset(dataset_name, group, data);
      }
    } catch (const H5::Exception &e) {
      throw std::runtime_error("Error writing dataset '" + dataset_name +
                               "': " + e.getDetailMsg());
    }
  }

  void close() {
    // Close the HDF5 file
    _file.close();
  }

  void set_keypaths(const std::vector<std::string> &data_paths,
                    const std::string &group_name) {
    _keypaths[group_name] = data_paths;
  }

  void set_keypath_separator(const std::string &separator) {
    if (separator.empty() || separator.find("/") != std::string::npos) {
      throw std::invalid_argument(
          "Keypath separator cannot be empty nor contain '/'.");
    }
    _keypath_sep = separator;
  }

  std::string keypath_separator() const { return _keypath_sep; }

  const std::vector<std::string> &
  keypaths(std::string const &group_name) const {
    return _keypaths.at(group_name);
  }

  std::vector<std::string> &groups() const {
    if (_keypaths.empty()) {
      throw std::runtime_error("No groups defined in keypaths.");
    }
    // return a vector of group names
    static std::vector<std::string> group_names;
    group_names.clear();
    for (const auto &pair : _keypaths) {
      group_names.push_back(pair.first);
    }
    return group_names;
  }

  auto &append_keypath(std::string const &dataset_name,
                       std::string const &group_name) {
    if (_keypaths.find(group_name) == _keypaths.end()) {
      _keypaths[group_name] = {"timecode", "timestamp"};
    }
    // Add dataset name to the list of data paths
    _keypaths[group_name].push_back(dataset_name);
    return *this;
  }

private:
  H5::H5File _file; // HDF5 file object
  std::map<std::string, std::vector<std::string>>
      _keypaths; // Store dataset names
  std::string _keypath_sep = ".";

  nlohmann::json json_from_keypath(const nlohmann::json &j,
                                   const std::string &keypath) {
    nlohmann::json result = j;
    size_t start = 0;
    size_t end = keypath.find(_keypath_sep);
    while (end != std::string::npos) {
      std::string key = keypath.substr(start, end - start);
      if (result.contains(key)) {
        result = result[key];
      } else {
        return nullptr;
      }
      start = end + _keypath_sep.length();
      end = keypath.find(_keypath_sep, start);
    }
    result = result.contains(keypath.substr(start))
                 ? result[keypath.substr(start)]
                 : nullptr;
    if (result.contains("$date")) {
      // Handle timestamp with $date
      result = result["$date"];
    }
    return result;
  }

  // Helper method to create a new dataset based on JSON data type
  void create_dataset(const std::string &dataset_name, const H5::Group &group,
                      const nlohmann::json &data) {
    if (data.is_number_float()) {
      create_scalar_dataset<double>(dataset_name, group, data.get<double>());
    } else if (data.is_number_integer()) {
      create_scalar_dataset<int64_t>(dataset_name, group, data.get<int64_t>());
    } else if (data.is_string()) {
      create_string_dataset(dataset_name, group, data.get<std::string>());
    } else if (data.is_array()) {
      create_array_dataset(dataset_name, group, data);
    } else {
      throw std::runtime_error("Unsupported JSON data type for dataset: " +
                               dataset_name);
    }
  }

  // Helper method to append data to existing dataset
  void append_to_dataset(const std::string &dataset_name,
                         const H5::Group &group, const nlohmann::json &data) {
    H5::DataSet dataset = group.openDataSet(dataset_name);
    H5::DataSpace current_space = dataset.getSpace();

    // Get current dimensions
    int rank = current_space.getSimpleExtentNdims();
    std::vector<hsize_t> current_dims(rank);
    current_space.getSimpleExtentDims(current_dims.data());

    if (data.is_array()) {
      // Append array as new row to matrix
      append_array_to_matrix(dataset, data, group, current_dims);
    } else {
      // Append scalar to vector
      append_scalar_to_vector(dataset, data, group, current_dims);
    }

    dataset.close();
  }

  // Create scalar dataset (for initial single values)
  template <typename T>
  void create_scalar_dataset(const std::string &dataset_name,
                             const H5::Group &group, T value) {
    // Create 1D dataset with initial size 1, unlimited max size
    hsize_t dims[1] = {1};
    hsize_t max_dims[1] = {H5S_UNLIMITED};
    H5::DataSpace space(1, dims, max_dims);

    // Create dataset with chunking for extensibility
    H5::DSetCreatPropList prop;
    hsize_t chunk_dims[1] = {1024}; // Chunk size
    prop.setChunk(1, chunk_dims);

    H5::DataType data_type;
    if constexpr (std::is_same_v<T, double>) {
      data_type = H5::PredType::NATIVE_DOUBLE;
    } else if constexpr (std::is_same_v<T, int64_t>) {
      data_type = H5::PredType::NATIVE_LLONG;
    }

    H5::DataSet dataset =
        group.createDataSet(dataset_name, data_type, space, prop);

    // Write initial value
    dataset.write(&value, data_type);
    dataset.close();
  }

  // Create string dataset
  void create_string_dataset(const std::string &dataset_name,
                             const H5::Group &group, const std::string &value) {
    // Create variable-length string type
    H5::StrType string_type(H5::PredType::C_S1, H5T_VARIABLE);

    hsize_t dims[1] = {1};
    hsize_t max_dims[1] = {H5S_UNLIMITED};
    H5::DataSpace space(1, dims, max_dims);

    H5::DSetCreatPropList prop;
    hsize_t chunk_dims[1] = {1024};
    prop.setChunk(1, chunk_dims);

    H5::DataSet dataset =
        group.createDataSet(dataset_name, string_type, space, prop);

    const char *str_data = value.c_str();
    dataset.write(&str_data, string_type);
    dataset.close();
  }

  // Create array dataset (2D matrix)
  void create_array_dataset(const std::string &dataset_name,
                            const H5::Group &group,
                            const nlohmann::json &array) {
    if (array.empty()) {
      throw std::runtime_error("Cannot create dataset from empty array");
    }

    size_t array_size = array.size();

    // Determine data type from first element
    if (array[0].is_number_float()) {
      create_array_dataset_typed<double>(dataset_name, group, array);
    } else if (array[0].is_number_integer()) {
      create_array_dataset_typed<int64_t>(dataset_name, group, array);
    } else if (array[0].is_string()) {
      create_string_array_dataset(dataset_name, group, array);
    } else {
      throw std::runtime_error("Unsupported array element type for dataset: " +
                               dataset_name);
    }
  }

  template <typename T>
  void create_array_dataset_typed(const std::string &dataset_name,
                                  const H5::Group &group,
                                  const nlohmann::json &array) {
    size_t array_size = array.size();

    // Create 2D dataset: rows x columns (1 x array_size initially)
    hsize_t dims[2] = {1, array_size};
    hsize_t max_dims[2] = {H5S_UNLIMITED, array_size};
    H5::DataSpace space(2, dims, max_dims);

    H5::DSetCreatPropList prop;
    hsize_t chunk_dims[2] = {1024, array_size};
    prop.setChunk(2, chunk_dims);

    H5::DataType data_type;
    if constexpr (std::is_same_v<T, double>) {
      data_type = H5::PredType::NATIVE_DOUBLE;
    } else if constexpr (std::is_same_v<T, int64_t>) {
      data_type = H5::PredType::NATIVE_LLONG;
    }

    H5::DataSet dataset =
        group.createDataSet(dataset_name, data_type, space, prop);

    // Convert JSON array to C++ vector
    std::vector<T> data;
    for (const auto &element : array) {
      data.push_back(element.get<T>());
    }

    dataset.write(data.data(), data_type);
    dataset.close();
  }

  void create_string_array_dataset(const std::string &dataset_name,
                                   const H5::Group &group,
                                   const nlohmann::json &array) {
    size_t array_size = array.size();

    H5::StrType string_type(H5::PredType::C_S1, H5T_VARIABLE);

    hsize_t dims[2] = {1, array_size};
    hsize_t max_dims[2] = {H5S_UNLIMITED, array_size};
    H5::DataSpace space(2, dims, max_dims);

    H5::DSetCreatPropList prop;
    hsize_t chunk_dims[2] = {1024, array_size};
    prop.setChunk(2, chunk_dims);

    H5::DataSet dataset =
        group.createDataSet(dataset_name, string_type, space, prop);

    // Convert to array of C strings
    std::vector<const char *> string_data;
    std::vector<std::string> strings; // Keep strings alive
    for (const auto &element : array) {
      strings.push_back(element.get<std::string>());
      string_data.push_back(strings.back().c_str());
    }

    dataset.write(string_data.data(), string_type);
    dataset.close();
  }

  // Append scalar to vector (1D dataset)
  void append_scalar_to_vector(H5::DataSet &dataset, const nlohmann::json &data,
                               const H5::Group &group,
                               std::vector<hsize_t> &current_dims) {
    // Extend dataset by 1 element
    hsize_t new_dims[1] = {current_dims[0] + 1};
    dataset.extend(new_dims);

    // Get memory and file space for the new element
    H5::DataSpace file_space = dataset.getSpace();
    hsize_t offset[1] = {current_dims[0]};
    hsize_t count[1] = {1};
    file_space.selectHyperslab(H5S_SELECT_SET, count, offset);

    H5::DataSpace mem_space(1, count);

    // Write the new data
    if (data.is_number_float()) {
      double value = data.get<double>();
      dataset.write(&value, H5::PredType::NATIVE_DOUBLE, mem_space, file_space);
    } else if (data.is_number_integer()) {
      int64_t value = data.get<int64_t>();
      dataset.write(&value, H5::PredType::NATIVE_LLONG, mem_space, file_space);
    } else if (data.is_string()) {
      H5::StrType string_type(H5::PredType::C_S1, H5T_VARIABLE);
      dataset.write(data.get<std::string>(), string_type, mem_space,
                    file_space);
    }
  }

  // Append array as new row to matrix (2D dataset)
  void append_array_to_matrix(H5::DataSet &dataset, const nlohmann::json &array,
                              const H5::Group &group,
                              std::vector<hsize_t> &current_dims) {
    if (array.size() != current_dims[1]) {
      throw std::runtime_error("Array size mismatch: expected " +
                               std::to_string(current_dims[1]) + ", got " +
                               std::to_string(array.size()));
    }

    // Extend dataset by 1 row
    hsize_t new_dims[2] = {current_dims[0] + 1, current_dims[1]};
    dataset.extend(new_dims);

    // Select the new row in file space
    H5::DataSpace file_space = dataset.getSpace();
    hsize_t offset[2] = {current_dims[0], 0};
    hsize_t count[2] = {1, current_dims[1]};
    file_space.selectHyperslab(H5S_SELECT_SET, count, offset);

    H5::DataSpace mem_space(2, count);

    // Write the new row
    if (!array.empty()) {
      if (array[0].is_number_float()) {
        std::vector<double> row_data;
        for (const auto &element : array) {
          row_data.push_back(element.get<double>());
        }
        dataset.write(row_data.data(), H5::PredType::NATIVE_DOUBLE, mem_space,
                      file_space);
      } else if (array[0].is_number_integer()) {
        std::vector<int64_t> row_data;
        for (const auto &element : array) {
          row_data.push_back(element.get<int64_t>());
        }
        dataset.write(row_data.data(), H5::PredType::NATIVE_LLONG, mem_space,
                      file_space);
      } else if (array[0].is_string()) {
        H5::StrType string_type(H5::PredType::C_S1, H5T_VARIABLE);
        std::vector<const char *> string_data;
        std::vector<std::string> strings;
        for (const auto &element : array) {
          strings.push_back(element.get<std::string>());
          string_data.push_back(strings.back().c_str());
        }
        dataset.write(string_data.data(), string_type, mem_space, file_space);
      }
    }
  }
};

#endif // JSON2HDF5_HPP