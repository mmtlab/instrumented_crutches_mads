# Eye Tracker

This is a Python agent for [MADS](https://github.com/pbosetti/MADS) that integrates with Pupil Labs Neon eye trackers.

*Required MADS version: [2.0.0](https://github.com/pbosetti/MADS/releases/tag/v2.0.0)*

## Description

The `pupil_neon` agent enables data acquisition from Pupil Labs Neon eye tracking devices. It handles device discovery, connection management, recording control, and real-time synchronization monitoring.

## Features

- **Automatic Device Discovery**: Discovers Pupil Labs Neon devices on the local network
- **Recording Control**: Start/stop recordings with template-based metadata (subject ID, session ID, acquisition ID)
- **Condition Events**: Send labeled condition markers during recording for experimental protocols
- **Time Synchronization**: Estimates and publishes time offset and round-trip latency statistics
- **Health Monitoring**: Continuous connection health checks and status reporting
- **Agent Status Tracking**: Reports connection state and errors via MADS publish/subscribe

## Agent States

- **STARTUP**: Agent initializing
- **IDLE**: Connected to MADS, waiting for commands (no device connected)
- **CONNECTED**: Device connected and ready for recording
- **RECORDING**: Currently recording data
- **SHUTDOWN**: Agent shutting down

## Supported Commands

Commands are received via MADS topic and processed based on agent state:

| Command | State | Action |
|---------|-------|--------|
| `pupil_neon_connect` | IDLE | Discover and connect to Pupil Neon device |
| `pupil_neon_disconnect` | CONNECTED, RECORDING | Stop recording (if active) and disconnect device |
| `start` | CONNECTED | Fill device template and start recording |
| `stop` | RECORDING | Stop recording and save data |
| `condition` | RECORDING | Send labeled condition marker (e.g., "trial_A.begin") |

## Published Data

The agent publishes the following information to the MADS topic:

```json
{
  "agent_status": "idle|connected|recording",
  "error": "error message (if any)",
  "time_offset_ms_mean": 0.5,
  "time_offset_ms_std": 0.2,
  "time_offset_ms_median": 0.4,
  "roundtrip_duration_ms_mean": 15.3,
  "roundtrip_duration_ms_std": 2.1,
  "roundtrip_duration_ms_median": 14.9
}
```

- **agent_status**: Current operational state
- **error**: Error message if connection is lost or operation fails
- **time_offset_ms_***: Estimated clock synchronization offset in milliseconds (mean, std, median)
- **roundtrip_duration_ms_***: Network round-trip latency statistics in milliseconds

## INI Settings

```ini
[pupil_neon]
sub_topic = ["coordinator"]
pub_topic = "pupil_neon"
health_status_period = 500 # ms
```


## Setup

```bash
# Create and activate venv (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**Dependencies:**
- pupil-labs-realtime-api

## Run

```bash
python pupil_neon.py
```

