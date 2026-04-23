import argparse
import subprocess
import sys
import os
import time
from enum import Enum
from typing import Optional

import max30100


# locate mads python package
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, "python"))

from mads_agent import Agent, MessageType


class AgentStatus(Enum):
    STARTUP = 0
    SHUTDOWN = 1
    IDLE = 2
    RECORDING = 3


class PpgAgent:
    def __init__(self, broker_url="tcp://localhost:9092", options="side=unknown"):
        self.agent = Agent("ppg", broker_url)
        self.agent.set_id("ppg")
        self.agent.set_settings_timeout(2000)
        if self.agent.init() != 0:
            sys.stderr.write("Cannot contact broker\nCheck if the broker is running and the URL is correct.\n Check the mads.ini file.\n")
            sys.exit(1)
        self.agent.connect()

        settings = self.agent.settings()

        self.pub_topic = settings.get("pub_topic", "ppg")
        self.sub_topic = settings.get("sub_topic", ["coordinator"])
        if isinstance(self.sub_topic, str):
            self.sub_topic = [self.sub_topic]
        elif not isinstance(self.sub_topic, list):
            self.sub_topic = [str(self.sub_topic)]

        self.health_status_period = int(settings.get("health_status_period", 500))
        self.period = int(settings.get("period", 1))
        print(f"PPG agent settings: pub_topic={self.pub_topic}, sub_topic={self.sub_topic}, health_status_period={self.health_status_period}ms, period={self.period}ms, options={options}")

        # Keep receive non-blocking enough to honor publish timers.
        receive_timeout_ms = max(10, min(self.health_status_period, self.period, 100))
        self.agent.set_receive_timeout(receive_timeout_ms)

        self.side = settings.get("side", "unknown")
        if options != "side=unknown":
            options_dict = dict(opt.split("=", 1) for opt in options.split(",") if "=" in opt)
            self.side = options_dict.get("side", "unknown")

        self.sensor_mode = max30100.MODE_HR
        self.sensor_sample_rate = 100
        self.sensor_led_current_red = 50.0
        self.sensor_led_current_ir = 50.0
        self.sensor_pulse_width = 1600
        self.enable_spo2 = True
        self.max_buffer_len = 1

        # Lazily initialize sensor only on start command.
        self.mx30 = None
        self._probe_sensor()

        # agent status tracking
        self.agent_status = AgentStatus.STARTUP

        self._accept_all_topics = "" in self.sub_topic
        self._sub_topics_set = {str(topic) for topic in self.sub_topic if topic != ""}

        time.sleep(0.5)  # Give some time for the agent to be fully ready

        # After publishing startup status, we can set the status to IDLE to indicate we are ready for commands
        self.agent_status = AgentStatus.IDLE
        print("PPG agent started")

    def _publish_metrics_and_status(self, ir=None, red=None, error: Optional[str] = None, include_status: bool = False):
        
        payload = {}

        if include_status:
            payload["agent_status"] = self.agent_status.name.lower()

        if ir is not None and red is not None:
            payload["ir"] = ir
            payload["red"] = red

        if error is not None:
            payload["error"] = error

        if payload:
            # add side only when something is actually published
            payload["side"] = self.side

            self.agent.publish(payload, self.pub_topic)

    def start_recording(self):
        if self.agent_status == AgentStatus.RECORDING:
            return
        self._start_sensor()
        print("PPG sensor recording started")
        self.agent_status = AgentStatus.RECORDING

    def stop_recording(self):
        self._stop_sensor()
        print("PPG sensor recording stopped")
        self.agent_status = AgentStatus.IDLE

    def _start_sensor(self):
        if self.mx30 is not None:
            return
        self.mx30 = max30100.MAX30100(
            mode=self.sensor_mode,
            sample_rate=self.sensor_sample_rate,
            led_current_red=self.sensor_led_current_red,
            led_current_ir=self.sensor_led_current_ir,
            pulse_width=self.sensor_pulse_width,
            max_buffer_len=self.max_buffer_len
        )
        if self.enable_spo2:
            self.mx30.enable_spo2()

    def _probe_sensor(self):
        probe = None
        try:
            probe = max30100.MAX30100(
                mode=self.sensor_mode,
                sample_rate=self.sensor_sample_rate,
                led_current_red=self.sensor_led_current_red,
                led_current_ir=self.sensor_led_current_ir,
                pulse_width=self.sensor_pulse_width,
                max_buffer_len=self.max_buffer_len
            )
            probe.enable_spo2()
            probe.get_part_id()
        finally:
            if probe is not None:
                try:
                    probe.shutdown()
                except Exception:
                    pass
            self.mx30 = None

    def _stop_sensor(self):
        if self.mx30 is None:
            return
        try:
            self.mx30.shutdown()
        finally:
            self.mx30 = None

    def _process_command(self, topic, message):
        if not self._accept_all_topics and topic not in self._sub_topics_set:
            return

        if not isinstance(message, dict):
            return

        cmd = message.get("command")
        if not cmd:
            return

        cmd = str(cmd).lower()
        if cmd == "start":
            try:
                self.start_recording()
            except Exception as exc:
                self.agent_status = AgentStatus.IDLE
                self._publish_metrics_and_status(ir=None, red=None, error=f"Failed to start sensor: {exc}")
        elif cmd == "stop":
            try:
                self.stop_recording()
            except Exception as exc:
                self._publish_metrics_and_status(ir=None, red=None, error=f"Failed to stop sensor: {exc}")

    def run(self):
        """Main run loop: publish status/metrics and react to commands."""

        health_period_s = max(self.health_status_period, 1) / 1000.0
        sample_period_s = max(self.period, 1) / 1000.0

        next_health_ts = time.monotonic() + health_period_s
        next_sample_ts = time.monotonic() + sample_period_s

        try:
            while True:
                now = time.monotonic()

                # check if it's time to publish health status (even if we have no new sensor data, to indicate we are alive and our status)
                include_status = now >= next_health_ts
                if include_status:
                    next_health_ts = now + health_period_s

                if self.agent_status == AgentStatus.RECORDING and now >= next_sample_ts:
                    try:
                        if self.mx30 is None:
                            raise RuntimeError("Sensor not initialized")
                        self.mx30.read_sensor()

                        self._publish_metrics_and_status(ir=self.mx30.ir, red=self.mx30.red, error=None, include_status=include_status)
                    except Exception as exc:
                        self._publish_metrics_and_status(ir=None, red=None, error=str(exc), include_status=include_status)
                    next_sample_ts = now + sample_period_s

                elif self.agent_status != AgentStatus.RECORDING and include_status:
                    self._publish_metrics_and_status(ir=None, red=None, error=None, include_status=include_status)


                msg_type = self.agent.receive()
                if msg_type != MessageType.NONE:
                    topic, message = self.agent.last_message()
                    self._process_command(topic, message)


        except KeyboardInterrupt:
            pass
        finally:
            self.agent_status = AgentStatus.SHUTDOWN
            try:
                self._stop_sensor()
                self._publish_metrics_and_status(ir=None, red=None, error="Agent shutting down")
            except Exception:
                pass
            try:
                self.agent.disconnect()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="PPG MADS agent")
    parser.add_argument("-s", "--server", default="tcp://localhost:9092",
                        help="Broker URL (default: tcp://localhost:9092)")
    parser.add_argument("-o", "--options", default="side=unknown",
                        help="crutch side (default: side=unknown)")
    args = parser.parse_args()

    agent = None
    last_error = None
    exit_code = 0
    try:
        agent = PpgAgent(broker_url=args.server, options=args.options)
        agent.run()
    except KeyboardInterrupt:
        exit_code = 0
    except Exception as exc:
        last_error = exc
        sys.stderr.write(f"Error running PpgAgent: {exc}\n")
        exit_code = 1
    finally:
        if agent is not None:
            try:
                if last_error is not None:
                    agent._publish_metrics_and_status(ir=None, red=None, error=str(last_error))
            except Exception:
                pass
        sys.exit(exit_code)


if __name__ == "__main__":
    main()