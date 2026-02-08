# Multi-Platform LoadCell Plugin Support

## Overview
The LoadCell plugin is now configured to compile on both **Raspberry Pi** (real-time acquisition via HX711) and **Windows** (simulation mode) without maintaining separate versions of CMakeLists.txt and loadcell.cpp.

## Architecture

### Platform Detection
The platform is automatically detected by CMakeLists.txt:
- **Raspberry Pi**: Detected via `CMAKE_SYSTEM_PROCESSOR` (arm/aarch64)
- **Windows**: All other platforms

### Compilation Macros
Two main macros control the behavior:

```cpp
#ifdef PLATFORM_RASPBERRY_PI
  // Code for real-time HX711 acquisition
#else
  // Code for Windows simulation
#endif
```

## Compilation

### On Raspberry Pi
```bash
cd loadcell
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .
```
The build will automatically include:
- HX711 library
- Real-time acquisition code

### On Windows
```bash
cd loadcell
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .
```
The build will include:
- Generic libraries (nlohmann::json, pugg)
- Simulation code

## Functional Differences

### Data Acquisition

**Raspberry Pi (Real Hardware)**:
```cpp
// Acquires real data from HX711
double loadCellValue = _hx->weight(1).getValue(Mass::Unit::N);
out[_params["side"]] = loadCellValue - _offset;
```

**Windows (Simulation)**:
```cpp
// Simulates readings with random noise
float test = (_params["side"] == "right") ? 140.0 : 40.0;
out[_params["side"]] = test + _debug_offset + (rand() % 6 - 3) - _offset;
```

### Parameter Configuration

**Raspberry Pi** - Required:
```json
{
  "side": "left|right",
  "datapin": <int>,
  "clockpin": <int>,
  "scaling": <double>,
  "enabled": true|false (default: true)
}
```

**Windows** - Optional:
```json
{
  "side": "left|right"
}
```

## Limitations and Notes

### Windows (Simulation)
- Data is **completely simulated** with random values
- Does not require any HX711 hardware
- Perfect for testing and development

### Raspberry Pi (Real Hardware)
- Requires HX711 library installed
- Acquires real data in real-time
- Requires `datapin`, `clockpin`, and `scaling` in configuration

## Include Headers

```cpp
// Conditional includes:
#ifdef PLATFORM_RASPBERRY_PI
  #include <hx711/common.h>
  using namespace HX711;
#endif

// Always included:
#include <memory>
#include <chrono>
```

## Member Data Structure

```cpp
private:
#ifdef PLATFORM_RASPBERRY_PI
  unique_ptr<AdvancedHX711> _hx;  // Only on Raspberry Pi
#else
  void* _hx = nullptr;             // Placeholder on Windows
#endif
```