import subprocess
import sys
import os
import time
import threading

# locate mads python package
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, 'python'))

from mads_agent import Agent, MessageType


from pupil_labs.realtime_api.models import InvalidTemplateAnswersError, TemplateItem

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
        
        # Health check control
        self._health_thread = None
        self._stop_health = threading.Event()
        
        # Connection tracking
        self._connected = False

    def publish_connection_status(self, connected: bool, error: str or None):
        """Publish connection status to pupil_neon topic."""
        payload = {
            'pupil_neon_connected': bool(connected)
        }
        if error is not None:
            payload['pupil_neon_connection_error'] = error
        try:
            print(f"Publishing connection status: {payload}")
            self.agent.publish('pupil_neon', payload)
            print("Connection status published successfully.")
        except Exception:
            pass

    def connect_device(self):
        """Discover and connect to Pupil Neon device."""
        print("Attempting to connect to Pupil Neon device...")
        
        if discover_one_device is None:
            err = "pupil_labs.realtime_api not available"
            if not self._connected:
                self.publish_connection_status(False, err)
            return False
        
        try:
            dev = discover_one_device(max_search_duration_seconds=5)
        except Exception as e:
            err = str(e)
            if not self._connected:
                self.publish_connection_status(False, err)
            return False

        if dev is None:
            err = 'no device found'
            if not self._connected:
                self.publish_connection_status(False, err)
            return False
        print("Connected to Pupil Neon device:", dev)

        # Fetch current template definition
        template = dev.get_template()
        if template is None:
            err = 'no template found on device'
            if not self._connected:
                self.publish_connection_status(False, err)
            return False
        print("Current device template:", template)

        self.device = dev
        self.template = template
        self._connected = True
        self.publish_connection_status(True, None)
        return True

    def disconnect_device(self):
        """Disconnect from Pupil Neon device."""
        print("Disconnecting from Pupil Neon device...")
        
        if self.device is not None:
            try:
                self.device.close()
            except Exception as e:
                print(f"Error closing device: {e}")
        
        self.device = None
        self._connected = False
        self.publish_connection_status(False, None)
        print("Disconnected from Pupil Neon device.")

    def check_connection_health(self):
        """Verify connection is still active."""
        if self.device is None:
            return False

        try:
            scene_camera = self.device.world_sensor()
            connected = False if scene_camera is None else scene_camera.connected
            
            if self._connected and not connected:
                self._connected = False
                self.publish_connection_status(False, "Connection lost: scene camera not connected")
                return False
            
            return True
        except Exception as e:
            if self._connected:
                self._connected = False
                self.publish_connection_status(False, f"Connection lost: {str(e)}")
            return False

    def _publish_offset_stats(self, mean_to, std_to, med_to, mean_rt, std_rt, med_rt):
        """Publish time offset and roundtrip stats."""
        payload = {
            'time_offset_ms_mean': mean_to,
            'time_offset_ms_std': std_to,
            'time_offset_ms_median': med_to,
            'roundtrip_duration_ms_mean': mean_rt,
            'roundtrip_duration_ms_std': std_rt,
            'roundtrip_duration_ms_median': med_rt,
        }
        try:
            print(f"Publishing stats: {payload}")
            self.agent.publish('pupil_neon', payload)
        except Exception:
            pass

    def _health_loop(self):
        """Continuously check connection and estimate time offset every 5 seconds."""
        estimate_timeout = 10  # seconds
        
        while not self._stop_health.is_set():
            if self.device is None:
                time.sleep(1.0)
                continue
            
            # Check health first
            if not self.check_connection_health():
                time.sleep(5.0)
                continue
            
            # Estimate time offset with timeout
            try:
                print("Estimating time offset...")
                
                # Call estimate with timeout using threading
                result_container = []
                error_container = []
                
                def estimate_call():
                    try:
                        est = self.device.estimate_time_offset()
                        result_container.append(est)
                    except Exception as e:
                        error_container.append(e)
                
                estimate_thread = threading.Thread(target=estimate_call, daemon=True)
                estimate_thread.start()
                estimate_thread.join(timeout=estimate_timeout)
                
                # Check for timeout
                if estimate_thread.is_alive():
                    raise TimeoutError(f"estimate_time_offset timed out after {estimate_timeout} seconds")
                
                # Check for errors during the call
                if error_container:
                    raise error_container[0]
                
                # Check result
                if not result_container:
                    raise RuntimeError("estimate_time_offset returned no result")
                
                estimate = result_container[0]
                
                if estimate is None:
                    raise RuntimeError("estimate_time_offset returned None")
                
                # Extract and publish stats
                mean_to = float(estimate.time_offset_ms.mean)
                std_to = float(estimate.time_offset_ms.std)
                med_to = float(estimate.time_offset_ms.median)
                mean_rt = float(estimate.roundtrip_duration_ms.mean)
                std_rt = float(estimate.roundtrip_duration_ms.std)
                med_rt = float(estimate.roundtrip_duration_ms.median)
                
                self._publish_offset_stats(mean_to, std_to, med_to, mean_rt, std_rt, med_rt)
                
            except Exception as e:
                # Close device and report error
                print(f"Error estimating offset: {e}")
                try:
                    if self.device is not None:
                        self.device.close()
                except Exception:
                    pass
                
                self.device = None
                if self._connected:
                    self._connected = False
                    self.publish_connection_status(False, f"disconnected due to {str(e)}")
            
            # Wait 5 seconds before next estimate
            for _ in range(50):
                if self._stop_health.is_set():
                    break
                time.sleep(0.1)

    def start_health_loop(self):
        """Start the health check loop."""
        if self._health_thread and self._health_thread.is_alive():
            return
        self._stop_health.clear()
        self._health_thread = threading.Thread(target=self._health_loop, daemon=True)
        self._health_thread.start()

    def stop_health_loop(self):
        """Stop the health check loop."""
        self._stop_health.set()
        if self._health_thread:
            self._health_thread.join(timeout=1.0)

    def fill_template(self, subject_id=0, session_id=0, acquisition_id=0):
        """Fill template with subject/session info and send to device."""
        if self.device is None or self.template is None:
            print("Cannot fill template: device or template not available")
            return
        template_data = self.device.get_template_data()  # Refresh template before filling
        print(f"Current template data before filling: {template_data}")

        print(f"Filling template with subject_id={subject_id}, session_id={session_id}, acquisition_id={acquisition_id}")
        questionnaire = {}
        if self.template:
            try:
                for item in self.template.items:
                    print(f"Processing template item: {item}")
                    question = self.template.get_question_by_id(item.id)
                    if item.title == "Subject ID":
                        template_input = str(subject_id)
                    elif item.title == "Session ID":
                        template_input = str(session_id)
                    elif item.title == "Acquisition ID":
                        template_input = str(acquisition_id)

                    print(f"Validating input for '{item.title}': {template_input}")
                    try:
                        errors = question.validate_answer(template_input)
                        if not errors:
                            questionnaire[str(item.id)] = template_input
                            print(f"Added '{item.title}' to questionnaire with value: {template_input}")
                        else:
                            print(f"Errors: {errors}")
                    except InvalidTemplateAnswersError as e:
                        print(f"Validation failed for: {template_input}")
                        for error in e.errors:
                            print(f"    {error['msg']}")
            except Exception as e:
                print(f"Error filling template: {e}")
                return
            
        print(f"Filled questionnaire: {questionnaire}")
        try:
            # Sending the template
            if questionnaire:
                self.device.post_template_data(questionnaire)
        except Exception as e:
            print(f"Error sending filled template: {e}")
            return
            
        print(f"Sent filled template for subject_id={subject_id}, session_id={session_id}, acquisition_id={acquisition_id}")
       

    def run(self):
        """Main run loop - wait for connect/disconnect commands."""
        self.running = True

        try:
            while self.running:
                msg_type = self.agent.receive()
                if msg_type == MessageType.NONE:
                    time.sleep(0.01)
                    continue

                topic, message = self.agent.last_message()
                
                if not isinstance(message, dict):
                    continue
                
                if topic != 'command':
                    continue

                cmd = message.get('command')
                if not cmd:
                    continue

                cmd = str(cmd).lower()
                
                if cmd == 'pupil_neon_connect':
                    print("Received pupil_neon_connect command")
                    if self.connect_device():
                        self.start_health_loop()
                
                elif cmd == 'pupil_neon_disconnect':
                    print("Received pupil_neon_disconnect command")
                    self.stop_health_loop()
                    self.disconnect_device()

                elif cmd == 'condition':
                    label = message.get('label', 'NA')
                    print(f"Received condition command with label: {label}")
                    if self._connected and self.device is not None:
                        self.device.send_event(label)

                elif cmd == 'start':
                    subject_id = message.get('subject_id', -1)
                    session_id = message.get('session_id', -1)
                    acquisition_id = message.get('id', -1)
                    print(f"Received start command with subject_id: {subject_id}, session_id: {session_id}, acquisition_id: {acquisition_id}")
                    if self._connected and self.device is not None:
                        self.fill_template(subject_id, session_id, acquisition_id)
                        self.device.recording_start()

                elif cmd == 'stop':
                    print("Received stop command")
                    if self._connected and self.device is not None:
                        self.device.recording_stop_and_save()

        except KeyboardInterrupt:
            pass
        finally:
            self.stop_health_loop()
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
                agent.stop_health_loop()
                if agent._connected:
                    agent.disconnect_device()
                    agent.publish_connection_status(False, "Agent shutting down")
            except Exception:
                pass


if __name__ == '__main__':
    main()
