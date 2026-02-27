from cProfile import label
import subprocess
import sys
import os
import time
import threading
from enum import Enum

# locate mads python package
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, 'python'))

from mads_agent import Agent, MessageType


from pupil_labs.realtime_api.models import InvalidTemplateAnswersError, TemplateItem

try:
    from pupil_labs.realtime_api.simple import discover_one_device
except Exception:
    discover_one_device = None

class AgentStatus(Enum):
    STARTUP = 0
    SHUTDOWN = 1
    IDLE = 2
    CONNECTED = 3
    RECORDING = 4

class PupilNeonAgent:
    def __init__(self, broker_url="tcp://localhost:9092"):
        self.agent = Agent("pupil_neon", broker_url)
        self.agent.set_id("pupil_neon")
        self.agent.set_settings_timeout(2000)
        if self.agent.init() != 0:
            sys.stderr.write("Cannot contact broker\n")
            sys.exit
        self.agent.connect()
        print(self.agent.settings()) # received from the broker
    
        self.agent.set_receive_timeout(200)

        self.health_status_period = self.agent.settings().get("health_status_period", 500) # ms
        self._last_health_status_time = time.time()
        print(f"Health status will be published every {self.health_status_period} ms")

        self.device = None
        self.last_condition_event = None
        
        # Health check control
        self._health_thread = None
        self._stop_health = threading.Event()
        
        # agent status tracking
        self.agent_status = AgentStatus.STARTUP

        time.sleep(0.5)  # Give some time for the agent to be fully ready
        self.publish_agent_status(None)

        # After publishing startup status, we can set the status to IDLE to indicate we are ready for commands
        self.agent_status = AgentStatus.IDLE
        print("Pupil Neon agent started")

    def publish_agent_status(self, error: str or None):
        """Publish agent status to pupil_neon topic."""
        payload = {
            'agent_status': self.agent_status.name.lower()
        }
        if error is not None:
            payload['error'] = error
        try:
            #print(f"Publishing agent status: {payload}")
            self.agent.publish('pupil_neon', payload)
        except Exception:
            pass

    def connect_device(self):
        """Discover and connect to Pupil Neon device."""
        print("Attempting to connect to Pupil Neon device...")
        
        if discover_one_device is None:
            err = "pupil_labs.realtime_api not available"
            self.publish_agent_status(err)
            return False
        
        try:
            dev = discover_one_device(max_search_duration_seconds=5)
        except Exception as e:
            err = str(e)
            self.publish_agent_status(err)
            return False

        if dev is None:
            err = 'no device found'
            self.publish_agent_status(err)
            return False

        # Fetch current template definition
        template = dev.get_template()
        if template is None:
            err = 'Connected to a device, but no template was found on the device'
            self.publish_agent_status(err)
            return False

        self.device = dev
        self.template = template

        print("Connected to Pupil Neon device:", dev)
        print("Current device template:", template)
        self.agent_status = AgentStatus.CONNECTED
        self.publish_agent_status(None)

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
        self.agent_status = AgentStatus.IDLE
        self.publish_agent_status(None)
        print("Disconnected from Pupil Neon device.")

    def check_connection_health(self):
        """Verify connection is still active."""
        if self.device is None:
            return False

        try:
            scene_camera = self.device.world_sensor()
            connected = False if scene_camera is None else scene_camera.connected
            
            if (self.agent_status == AgentStatus.CONNECTED or self.agent_status == AgentStatus.RECORDING) and not connected:
                self.agent_status = AgentStatus.IDLE
                self.publish_agent_status("Connection lost: scene camera not connected")
                return False
            
            return True
        except Exception as e:
            if self.agent_status == AgentStatus.CONNECTED or self.agent_status == AgentStatus.RECORDING:
                self.agent_status = AgentStatus.IDLE
                self.publish_agent_status(f"Connection lost: {str(e)}")
            return False

    def start_recording(self): 
        self.device.recording_start()

        # update status after starting recording, if recording fails the health loop will catch it and update the status accordingly
        self.agent_status = AgentStatus.RECORDING
        self.publish_agent_status(None)

    def stop_recording(self): 

        if self.last_condition_event is not None:
            self.device.send_event(self.last_condition_event + ".end")
            print(f"Sent condition event with label: {self.last_condition_event}.end")
            self.last_condition_event = None

        time.sleep(0.1) # add a short delay to ensure the .end event is processed before stopping the recording
        self.device.recording_stop_and_save()

        # update status after stopping recording, if recording fails the health loop will catch it and update the status accordingly
        self.agent_status = AgentStatus.CONNECTED
        self.publish_agent_status(None)

    def send_condition_event(self, label):

        # if it is the first condition event we send it with the .begin suffix
        if self.last_condition_event is None:
            self.device.send_event(label + ".begin")
            print(f"Sent condition event with label: {label}.begin")
            self.last_condition_event = label

        elif self.last_condition_event != label:
            self.device.send_event(self.last_condition_event + ".end")
            print(f"Sent condition event with label: {self.last_condition_event}.end")
            time.sleep(0.05) # add a short delay to ensure the .end event is processed before the next .begin event
            self.device.send_event(label + ".begin")
            print(f"Sent condition event with label: {label}.begin")
            self.last_condition_event = label
        
        else:
            return

        

    def _publish_offset_stats(self, mean_to, std_to, med_to, mean_rt, std_rt, med_rt):
        """Publish time offset and roundtrip stats. Also update the agent status"""
        payload = {
            'agent_status': self.agent_status.name.lower(),
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
                if self.agent_status == AgentStatus.CONNECTED or self.agent_status == AgentStatus.RECORDING:
                    self.agent_status = AgentStatus.IDLE
                    self.publish_agent_status(f"disconnected due to {str(e)}")
            
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

        try:
            while True:
                # Firtly send a heartbeat with the current status if self.health_status_period is passed
                if time.time() - self._last_health_status_time > self.health_status_period / 1000.0:
                    self.publish_agent_status(None)
                    self._last_health_status_time = time.time()

                msg_type = self.agent.receive()
                if msg_type == MessageType.NONE:
                    time.sleep(0.01)
                    continue

                topic, message = self.agent.last_message()
                
                if not isinstance(message, dict):
                    continue

                cmd = message.get('command')
                if not cmd:
                    continue

                cmd = str(cmd).lower()

                # we reach here if we have a valid command message
                # now the agent should react to the command accordinding to its current state and the command type

                match self.agent_status:
                    case AgentStatus.IDLE | AgentStatus.STARTUP:
                        # ignore all commands except connect
                        if cmd == 'pupil_neon_connect':
                            print("Received connect command")
                            if self.connect_device():
                                self.start_health_loop()

                    case AgentStatus.CONNECTED:
                        # ignore all commands except disconnect andstart
                        if cmd == 'pupil_neon_disconnect':
                            print("Received disconnect command")
                            self.stop_health_loop()
                            self.disconnect_device()

                        elif cmd == 'start':
                            subject_id = message.get('subject_id', -1)
                            session_id = message.get('session_id', -1)
                            acquisition_id = message.get('id', -1)
                            print(f"Received start command with subject_id: {subject_id}, session_id: {session_id}, acquisition_id: {acquisition_id}")
                            self.fill_template(subject_id, session_id, acquisition_id)
                            self.start_recording()
                            

                    case AgentStatus.RECORDING:
                        # ignore all commands except stop, condition and disconnect
                        # Assure to stop and save the recording on disconnect or stop command, otherwise we might lose data
                        if cmd == 'condition':
                            label = message.get('label', 'NA')
                            self.send_condition_event(label)
                            # this does not change the agent status, we are still recording after sending the event

                        elif cmd == 'stop':
                            print("Received stop command")
                            self.stop_recording()

                        elif cmd == 'pupil_neon_disconnect':
                            print("Received disconnect command")
                            self.stop_recording()
                            self.stop_health_loop()
                            self.disconnect_device()


        except KeyboardInterrupt:
            pass
        finally:
            self.stop_health_loop()


def main():
    agent = None
    exit_code = 0
    try:
        agent = PupilNeonAgent()
        agent.run()
    except KeyboardInterrupt:
        exit_code = 0
    except Exception as e:
        sys.stderr.write(f"Error running PupilNeonAgent: {e}\n")
        exit_code = 1
    finally:
        if agent:
            try:
                agent.stop_health_loop()
                if agent.agent_status == AgentStatus.CONNECTED or agent.agent_status == AgentStatus.RECORDING:
                    if agent.agent_status == AgentStatus.RECORDING:
                        agent.device.recording_stop_and_save()
                    agent.disconnect_device()

                # Publish shutdown status BEFORE disconnecting from broker
                agent.agent_status = AgentStatus.SHUTDOWN
                agent.publish_agent_status("Agent shutting down")

                time.sleep(0.5)  # Give time for message to be sent
                agent.agent.disconnect()

            except Exception as e:
                sys.stderr.write(f"Error shutting down PupilNeonAgent: {e}\n")
        
        sys.exit(exit_code)

if __name__ == '__main__':
    main()
