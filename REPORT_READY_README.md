# Instrumented Crutches - Test and System Report Template

Document version: 1.0
Project: Instrumented Crutches (MADS-based)

===============================================================================
1) DOCUMENT CONTROL
===============================================================================
Report title:
Author:
Date:
Revision:
Test environment (lab/clinical):
Related ticket/issue references:

===============================================================================
2) EXECUTIVE SUMMARY
===============================================================================
This document describes the Instrumented Crutches system, including software
architecture, installation procedure, operational workflow, and data acquisition
session results. The system is based on the MADS framework and a master/slave
architecture over two instrumented crutches.

Session objective:
Main outcome:
Key critical issues:
Next actions:

===============================================================================
3) SYSTEM OVERVIEW
===============================================================================
The system acquires biomechanical and physiological data from two instrumented
crutches, with optional eye-tracking integration (Pupil Neon) for combined
movement and visual-behavior analysis.

Key points:
- Real-time multi-sensor acquisition.
- Centralized coordination through MADS broker.
- Structured HDF5 logging.
- Web interface for start/stop, calibration, annotations, and status.

Roles:
- Master crutch (typically right): hosts web server, coordinator, status handler,
  hdf5 writer, eye tracker, and part of the sensors.
- Slave crutch (typically left): acquires and publishes sensor streams.

Communication:
- Publish/subscribe over MADS topics.

===============================================================================
4) TECHNICAL ARCHITECTURE
===============================================================================
Main agents (master only):
- web_server: UI and API for session management.
- coordinator: command orchestration and acquisition state management.
- status_handler: agent status/health aggregation.
- hdf5_writer: data persistence to HDF5 files.
- pupil_neon: eye-tracker integration.

Agents on both crutches:
- tip_loadcell: tip force acquisition.
- handle_loadcell: multi-channel handle force acquisition.
- ppg: photoplethysmography signal (IR/RED).
- ups: power and battery telemetry.

Simplified data flow:
1. web_server sends commands.
2. coordinator propagates commands to agents.
3. sensors publish streams.
4. status_handler produces aggregated system status.
5. hdf5_writer stores streams into HDF5.

===============================================================================
5) INSTALLATION SUMMARY
===============================================================================
Minimum prerequisites:
- Raspberry Pi Zero 2 W (or equivalent)
- Raspberry Pi OS
- MADS >= 2.0.0
- Python >= 3.9

Main setup steps:
1. Clone the repository.
2. Install/build required agents for master and slave.
3. Configure mads.ini.
4. Install and enable systemd services.
5. Configure network (master hotspot + slave auto-connect).
6. Configure time synchronization (chrony) on both nodes.

Important operational notes:
- Verify write permissions on the data folder used by web_server/hdf5_writer.
- Verify hotspot IP consistency with NTP configuration.
- Use side-specific service templates (left/right).

===============================================================================
6) USER OPERATION WORKFLOW
===============================================================================
Recommended workflow:
1. Power on master and wait for services startup.
2. Connect client device (PC/tablet/smartphone) to master hotspot.
3. Open the Record page (default: http://10.42.0.1:8000).
4. Run Update Datetime from the Status panel.
5. Power on slave and wait for network/time alignment.
6. Verify reachability of main nodes in Status.
7. Run calibration (crutch lifted, no force on handle).
8. (Optional) Connect eye-tracker.
9. Fill Test Configuration.
10. (Optional) Add comments and condition.
11. Start recording (Start).
12. Monitor system status during test.
13. Update condition if needed during acquisition.
14. Stop recording (Stop).
15. Visualize/download post-session data.

Post-recording outputs:
- Data visualization.
- CSV export (force_ID.csv, info_ID.csv).
- Session HDF5 file.

===============================================================================
7) DATA AND OUTPUTS
===============================================================================
Main data types:
- Tip loadcell forces.
- Handle loadcell forces (multi-channel).
- PPG (IR/RED).
- Agent status and health.
- UPS telemetry (voltage/current/power/percent/remaining time).
- Session events/metadata (condition, comments, session IDs).

Persistence format:
- HDF5 with topic/keypath-based structure.

Session identifiers:
- Subject ID
- Session ID
- Incremental Recording ID

===============================================================================
8) TEST SESSION DETAILS (TO BE FILLED)
===============================================================================
Subject ID:
Session ID:
Recording ID:
Master side:
Slave side:
Eye-tracker used (YES/NO):
Operator:
Test duration:

Configured parameters:
- Subject height:
- Subject weight:
- Crutch height:
- Initial condition:

Event timeline:
- T0 system startup:
- T1 calibration:
- T2 start recording:
- T3 condition change (if any):
- T4 stop recording:

===============================================================================
9) HEALTH CHECK RESULTS
===============================================================================
Agent reachability outcome:
- coordinator:
- status_handler:
- hdf5_writer:
- tip_loadcell (master/slave):
- handle_loadcell (master/slave):
- ppg (master/slave):
- ups (master/slave):
- pupil_neon (if used):

Detected errors:
Applied mitigations:
Final health outcome:

===============================================================================
10) ISSUES, RISKS, AND LIMITATIONS
===============================================================================
Open issues:
1.
2.
3.

Known risks:
- Time drift if NTP is not correctly aligned.
- Invalid calibration if performed under applied load.
- Hotspot network instability in noisy radio environments.

Session limitations:

===============================================================================
11) CONCLUSIONS
===============================================================================
Final summary:

Decision (PASS/FAIL/PASS WITH NOTES):

Recommended follow-up actions:
1.
2.
3.

===============================================================================
12) APPENDIX - QUICK REFERENCES
===============================================================================
Project documentation:
- docs/index.html
- docs/installation.html
- docs/usage.html
- docs/architecture.html

Agent READMEs:
- web_server/README.md
- coordinator/README.md
- status_handler/README.md
- hdf5_writer/README.md
- eye_tracker/README.md
- tip_loadcell/README.md
- handle_loadcell/README.md
- ppg/README.md
- ups/README.md

===============================================================================
END OF TEMPLATE
===============================================================================
