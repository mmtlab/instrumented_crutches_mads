import subprocess
import sys
import os
import time
import threading
from datetime import datetime, timezone

# locate mads python package
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, 'python'))

from mads_agent import Agent, MessageType

try:
    from pupil_labs.realtime_api.simple import discover_one_device
except Exception:
    discover_one_device = None


class PupilNeonAgent:
    def __init__(self, broker_url="tcp://localhost:9092"):
        self.agent = Agent("pupil_neon", broker_url)
        self.agent.set_id("pupil_neon")
        self.agent.set_settings_timeout(2000)
        if self.agent.init() != 0:
            raise RuntimeError("Cannot contact MADS broker")
        self.agent.connect()
        self.agent.set_receive_timeout(200)

        self.device = None
        self.running = False
        self.recording = False

        # estimator control
        self._estimator_stop = threading.Event()
        self._estimator_thread = None
        self._estimator_lock = threading.Lock()
        self._last_stats = None
        # connection tracking
        self._last_connection_error = None
        self._connected = False
        self._prev_connected = None

    # ----- pupil device helpers -----
    def ensure_device(self):
        # If we already have a device, ensure flag and return
        if self.device is not None:
            if not self._connected:
                self._connected = True
                self._last_connection_error = None
                self.publish_connection_status(self._connected, self._last_connection_error)
            return True

        if discover_one_device is None:
            # API not available
            err = "pupil_labs.realtime_api not available"
            self._last_connection_error = err
            if self._connected or self._prev_connected is None:
                self._connected = False
                self.publish_connection_status(False, err)
            return False

        try:
            dev = discover_one_device(max_search_duration_seconds=5)
        except Exception as e:
            err = str(e)
            self._last_connection_error = err
            if self._connected or self._prev_connected is None:
                self._connected = False
                self.publish_connection_status(False, err)
            return False

        if dev is None:
            err = 'no device found'
            self._last_connection_error = err
            if self._connected or self._prev_connected is None:
                self._connected = False
                self.publish_connection_status(False, err)
            return False

        # success
        self.device = dev
        self._last_connection_error = None
        if not self._connected:
            self._connected = True
            self.publish_connection_status(True, None)
        self._prev_connected = self._connected
        return True

    def publish_connection_status(self, connected: bool, error: str or None):
        payload = {
            'pupil_neon_connected': bool(connected),
            'pupil_neon_connection_error': error,
                'timestamp': datetime.now(timezone.utc).isoformat()
        }
        try:
            self.agent.publish('command', payload)
        except Exception:
            pass

    # ----- estimator thread -----
    def start_estimator(self):
        if self._estimator_thread and self._estimator_thread.is_alive():
            return
        self._estimator_stop.clear()
        self._estimator_thread = threading.Thread(target=self._estimator_loop, daemon=True)
        self._estimator_thread.start()

    def stop_estimator(self):
        self._estimator_stop.set()
        if self._estimator_thread:
            self._estimator_thread.join(timeout=1.0)

    def _estimator_loop(self):
        while not self._estimator_stop.is_set():
            if self.recording:
                # suspend estimation while recording
                time.sleep(0.5)
                continue

            if not self.ensure_device():
                time.sleep(5.0)
                continue

            try:
                estimate = self.device.estimate_time_offset()
            except Exception:
                time.sleep(5.0)
                continue

            # read stats directly from the Estimate object (mean/std/median provided by API)
            with self._estimator_lock:
                mean_to = float(getattr(estimate.time_offset_ms, 'mean', 0.0))
                std_to = float(getattr(estimate.time_offset_ms, 'std', 0.0))
                med_to = float(getattr(estimate.time_offset_ms, 'median', 0.0))

                mean_rt = float(getattr(estimate.roundtrip_duration_ms, 'mean', 0.0))
                std_rt = float(getattr(estimate.roundtrip_duration_ms, 'std', 0.0))
                med_rt = float(getattr(estimate.roundtrip_duration_ms, 'median', 0.0))

                self._last_stats = {
                    'time_offset_ms_mean': mean_to,
                    'time_offset_ms_std': std_to,
                    'time_offset_ms_median': med_to,
                    'roundtrip_duration_ms_mean': mean_rt,
                    'roundtrip_duration_ms_std': std_rt,
                    'roundtrip_duration_ms_median': med_rt,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }

            # wait 5 seconds between estimates
            for _ in range(50):
                if self._estimator_stop.is_set():
                    break
                time.sleep(0.1)

    # ----- message handling -----
    def publish_metadata(self, recording_id):
        payload = {
            'recording_id': recording_id,
        }
        with self._estimator_lock:
            if self._last_stats:
                payload.update(self._last_stats)
            else:
                # fallback: include empty stats
                payload.update({
                    'time_offset_ms_mean': 0.0,
                    'time_offset_ms_std': 0.0,
                    'time_offset_ms_median': 0.0,
                    'roundtrip_duration_ms_mean': 0.0,
                    'roundtrip_duration_ms_std': 0.0,
                    'roundtrip_duration_ms_median': 0.0,
                    'samples': 0,
                })

        # publish on 'command' so hdf5_writer and others receive it
        try:
            self.agent.publish('command', payload)
        except Exception:
            # best-effort: ignore publish failure
            pass

    def handle_start(self, message):
        # suspend estimator
        self.recording = True

        if not self.ensure_device():
            return

        try:
            recording_id = self.device.recording_start()
        except Exception:
            recording_id = None

        # wait 300 ms to ensure hdf5_writer is ready to receive
        time.sleep(0.3)

        # publish metadata
        self.publish_metadata(recording_id)

    def handle_stop(self, message):
        # stop recording and save
        try:
            if self.device is not None:
                try:
                    self.device.recording_stop_and_save()
                except Exception:
                    # try stop
                    try:
                        self.device.recording_stop()
                    except Exception:
                        pass
        finally:
            # resume estimator
            self.recording = False

    def run(self):
        self.running = True
        # start estimator thread
        self.start_estimator()

        try:
            while self.running:
                msg_type = self.agent.receive()
                if msg_type == MessageType.NONE:
                    time.sleep(0.01)
                    continue

                topic, message = self.agent.last_message()
                if not isinstance(message, dict):
                    continue

                cmd = message.get('command') or message.get('action')
                if not cmd:
                    continue

                cmd = str(cmd).lower()
                if cmd == 'start':
                    self.handle_start(message)
                elif cmd == 'stop':
                    self.handle_stop(message)

        except KeyboardInterrupt:
            pass
        finally:
            self.stop_estimator()
            try:
                self.agent.disconnect()
            except Exception:
                pass


def main():
    agent = None
    try:
        agent = PupilNeonAgent()
        print("Pupil Neon agent started")
        agent.run()
    except Exception as e:
        print(f"Error running PupilNeonAgent: {e}", file=sys.stderr)
    finally:
        if agent:
            try:
                agent.stop_estimator()
            except Exception:
                pass


if __name__ == '__main__':
    main()
