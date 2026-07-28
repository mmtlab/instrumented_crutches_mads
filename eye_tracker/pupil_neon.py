import argparse
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

        self.pub_topic = self.agent.settings().get("pub_topic", "pupil_neon")
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
        # always add the plugin name as fallback, in case the coordinator relies on it to identify the source of the message
        payload = {
            'agent_status': self.agent_status.name.lower()
        }
        if error is not None:
            payload['error'] = error
        try:
            #print(f"Publishing agent status: {payload}")
            self.agent.publish(payload, self.pub_topic)
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
            
            if (self.agent_status == AgentStatus.CONNECTED) and not connected:
                self.agent_status = AgentStatus.IDLE
                self.publish_agent_status("Connection lost: scene camera not connected")
                return False
            
            return True
        except Exception as e:
            if self.agent_status == AgentStatus.CONNECTED:
                self.agent_status = AgentStatus.IDLE
                self.publish_agent_status(f"Connection lost: {str(e)}")
            return False

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
            self.agent.publish(payload, self.pub_topic)
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
                if self.agent_status == AgentStatus.CONNECTED:
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

        except KeyboardInterrupt:
            pass
        finally:
            self.stop_health_loop()


def main():
    parser = argparse.ArgumentParser(description="Pupil Neon MADS agent")
    parser.add_argument("-s", "--server", default="tcp://localhost:9092",
                        help="Broker URL (default: tcp://localhost:9092)")
    args = parser.parse_args()

    agent = None
    exit_code = 0
    try:
        agent = PupilNeonAgent(broker_url=args.server)
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
                if agent.agent_status == AgentStatus.CONNECTED:
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
