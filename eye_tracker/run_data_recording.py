import argparse
import csv
from datetime import datetime
import os
import time
import msvcrt
from pupil_labs.realtime_api.simple import discover_one_device
from utils.config import config

# Flag to control recording stop
force_stop_recording = False

def save_params_csv(subject, session, condition, run, now, pupil_time_offset_ms, pupil_roundtrip_duration_ms, out_dir="."):
    filename = f"{out_dir}/acquisition_params_and_datetime.csv"
    file_exists = os.path.isfile(filename)
    with open(filename, mode='a', newline='') as csvfile:
        writer = csv.writer(csvfile)
        if not file_exists:
            writer.writerow(['subject', 'session', 'condition', 'run', 'datetime', 'pupil_time_offset_ms', 'pupil_roundtrip_duration_ms'])
        writer.writerow([subject, session, condition, run, now, pupil_time_offset_ms, pupil_roundtrip_duration_ms])

def start_recording(subject, session, condition, run, stop_event=None):

    print(" " * 50)
    print("=" * 50)
    print("Data Recording!")
    print("=" * 50)
    print("Looking for the Pupil Labs device...")
    device = discover_one_device(max_search_duration_seconds=10)
    if device is None:
        raise SystemExit("No Pupil Labs device found.")

    recording_id = device.recording_start()
    print(f"Started Pupil Labs recording with id {recording_id}")
    print("=" * 50)
    
    now = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    print(f"Recording started at {now}")
    print("=" * 50)

    estimate = device.estimate_time_offset()
    print(f"Estimated time offset: {estimate.time_offset_ms.mean} ms")
    print(f"Estimated roundtrip duration: {estimate.roundtrip_duration_ms.mean} ms")
    print("=" * 50)

    print(" " * 50)
    print("\033[92mPress 'q' or 'esc' to stop recording.\033[0m")
    try:
        while True:
            if stop_event is not None and stop_event.is_set():
                print("Stop event set. Exiting recording loop.")
                break
            
            if msvcrt.kbhit():
                key = msvcrt.getch()
                if key in [b'q', b'Q', b'\x1b']:
                    print("User requested exit.")
                    break
            
            # Check for errors while recording runs
            for e in device.get_errors():
                print("Error:", e)

            time.sleep(0.5)  # Sleep to avoid busy waiting
            
    finally:
        print("Saving parameters and datetime to CSV...")
        save_params_csv(
            subject, session, condition, run, now,
            estimate.time_offset_ms.mean, estimate.roundtrip_duration_ms.mean,
            out_dir=config['raw_data_path'] if config and 'raw_data_path' in config else "."
        )

        print("Stopping Pupil Labs recording...")
        device.recording_stop_and_save()
        device.close()
        print("Recording stopped and saved.")
        print("=" * 50)
        print(" " * 50)

def stop_recording(stop_event=None):
    if stop_event is not None:
        stop_event.set()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--subject', type=int, required=True, help='Subject number')
    parser.add_argument('--session', type=int, required=True, help='Session number')
    parser.add_argument('--condition', type=int, required=True, help='Condition number')
    parser.add_argument('--run', type=int, required=True, help='Run number')
    parser.set_defaults(external_cam=False)
    args = parser.parse_args()

    start_recording(
        subject=args.subject,
        session=args.session,
        condition=args.condition,
        run=args.run,
    )


if __name__ == "__main__":
    main()
