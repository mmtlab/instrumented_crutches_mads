import argparse
import os
import subprocess
import sys
import time
from collections import deque

try:
    import smbus
except ImportError:
    import smbus2 as smbus


# locate mads python package
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, "python"))

from mads_agent import Agent, MessageType


# Config Register (R/W)
_REG_CONFIG = 0x00
# SHUNT VOLTAGE REGISTER (R)
_REG_SHUNTVOLTAGE = 0x01
# BUS VOLTAGE REGISTER (R)
_REG_BUSVOLTAGE = 0x02
# POWER REGISTER (R)
_REG_POWER = 0x03
# CURRENT REGISTER (R)
_REG_CURRENT = 0x04
# CALIBRATION REGISTER (R/W)
_REG_CALIBRATION = 0x05


class BusVoltageRange:
    RANGE_16V = 0x00
    RANGE_32V = 0x01


class Gain:
    DIV_1_40MV = 0x00
    DIV_2_80MV = 0x01
    DIV_4_160MV = 0x02
    DIV_8_320MV = 0x03


class ADCResolution:
    ADCRES_9BIT_1S = 0x00
    ADCRES_10BIT_1S = 0x01
    ADCRES_11BIT_1S = 0x02
    ADCRES_12BIT_1S = 0x03
    ADCRES_12BIT_2S = 0x09
    ADCRES_12BIT_4S = 0x0A
    ADCRES_12BIT_8S = 0x0B
    ADCRES_12BIT_16S = 0x0C
    ADCRES_12BIT_32S = 0x0D
    ADCRES_12BIT_64S = 0x0E
    ADCRES_12BIT_128S = 0x0F


class Mode:
    POWERDOW = 0x00
    SVOLT_TRIGGERED = 0x01
    BVOLT_TRIGGERED = 0x02
    SANDBVOLT_TRIGGERED = 0x03
    ADCOFF = 0x04
    SVOLT_CONTINUOUS = 0x05
    BVOLT_CONTINUOUS = 0x06
    SANDBVOLT_CONTINUOUS = 0x07


class INA219:
    def __init__(self, i2c_bus=1, addr=0x43):
        self.bus = smbus.SMBus(i2c_bus)
        self.addr = addr

        self._cal_value = 0
        self._current_lsb = 0
        self._power_lsb = 0
        self.set_calibration_16V_5A()

    def read(self, address):
        data = self.bus.read_i2c_block_data(self.addr, address, 2)
        return (data[0] * 256) + data[1]

    def write(self, address, data):
        temp = [0, 0]
        temp[1] = data & 0xFF
        temp[0] = (data & 0xFF00) >> 8
        self.bus.write_i2c_block_data(self.addr, address, temp)

    def set_calibration_16V_5A(self):
        self._current_lsb = 0.1524
        self._cal_value = 26868
        self._power_lsb = 0.003048

        self.write(_REG_CALIBRATION, self._cal_value)

        self.bus_voltage_range = BusVoltageRange.RANGE_16V
        self.gain = Gain.DIV_2_80MV
        self.bus_adc_resolution = ADCResolution.ADCRES_12BIT_32S
        self.shunt_adc_resolution = ADCResolution.ADCRES_12BIT_32S
        self.mode = Mode.SANDBVOLT_CONTINUOUS
        self.config = (
            (self.bus_voltage_range << 13)
            | (self.gain << 11)
            | (self.bus_adc_resolution << 7)
            | (self.shunt_adc_resolution << 3)
            | self.mode
        )
        self.write(_REG_CONFIG, self.config)

    def get_shunt_voltage_mv(self):
        self.write(_REG_CALIBRATION, self._cal_value)
        value = self.read(_REG_SHUNTVOLTAGE)
        if value > 32767:
            value -= 65535
        return value * 0.01

    def get_bus_voltage_v(self):
        self.write(_REG_CALIBRATION, self._cal_value)
        self.read(_REG_BUSVOLTAGE)
        return (self.read(_REG_BUSVOLTAGE) >> 3) * 0.004

    def get_current_ma(self):
        value = self.read(_REG_CURRENT)
        if value > 32767:
            value -= 65535
        return value * self._current_lsb

    def get_power_w(self):
        self.write(_REG_CALIBRATION, self._cal_value)
        value = self.read(_REG_POWER)
        if value > 32767:
            value -= 65535
        return value * self._power_lsb


class UpsHatAgent:
    def __init__(self, broker_url="tcp://localhost:9092", options="side=unknown"):
        self.agent = Agent("ups_hat", broker_url)
        self.agent.set_id("ups_hat")
        self.agent.set_settings_timeout(2000)
        if self.agent.init() != 0:
            sys.stderr.write("Cannot contact broker\nCheck if the broker is running and the URL is correct.\n Check the mads.ini file.\n")
            sys.exit(1)
        self.agent.connect()

        settings = self.agent.settings()

        self.pub_topic = settings.get("pub_topic", "ups_hat")
        self.health_status_period = int(settings.get("health_status_period", 500))
        self.i2c_bus = int(settings.get("i2c_bus", 1))
        self.i2c_address = int(settings.get("i2c_address", 0x43))
        self.empty_voltage = float(settings.get("battery_empty_voltage", 3.0))
        self.full_voltage = float(settings.get("battery_full_voltage", 4.2))

        self.side = "unknown"
        if options != "side=unknown":
            options_dict = dict(opt.split("=", 1) for opt in options.split(",") if "=" in opt)
            self.side = options_dict.get("side", "unknown")

        self.ina219 = INA219(i2c_bus=self.i2c_bus, addr=self.i2c_address)

        self._history = deque()
        self._last_publish_ts = 0.0
        self._last_debug_len = 0
        self._eta_ema_seconds = None

        # ETA stability tuning
        self._eta_min_samples = 8
        self._eta_min_window_s = 20.0
        self._eta_slope_deadband = 1e-4  # percent/second
        self._eta_jump_limit = 0.30      # max +/-30% change per update before smoothing
        self._eta_ema_alpha = 0.22       # lower = smoother
        self._eta_max_seconds = 72.0 * 3600.0

    def _compute_percent(self, voltage):
        span = self.full_voltage - self.empty_voltage
        if span <= 0:
            return 0.0
        p = (voltage - self.empty_voltage) / span * 100.0
        if p < 0.0:
            return 0.0
        if p > 100.0:
            return 100.0
        return p

    def _update_history(self, ts, percent):
        self._history.append((ts, percent))
        one_minute_ago = ts - 60.0
        while self._history and self._history[0][0] < one_minute_ago:
            self._history.popleft()

    def _median(self, values):
        if not values:
            return None
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        mid = n // 2
        if n % 2 == 1:
            return sorted_vals[mid]
        return 0.5 * (sorted_vals[mid - 1] + sorted_vals[mid])

    def _linear_slope(self, xs, ys):
        n = len(xs)
        if n < 2:
            return None
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        denom = sum((x - mean_x) ** 2 for x in xs)
        if denom <= 0:
            return None
        return sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom

    def _robust_slope(self, xs, ys):
        # Two-pass fit: OLS, reject large residuals via MAD, then OLS again.
        slope = self._linear_slope(xs, ys)
        if slope is None:
            return None

        n = len(xs)
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        intercept = mean_y - slope * mean_x

        residuals = [y - (slope * x + intercept) for x, y in zip(xs, ys)]
        abs_residuals = [abs(r) for r in residuals]
        mad = self._median(abs_residuals)

        if mad is None or mad <= 1e-9:
            return slope

        threshold = max(0.15, 2.5 * mad)
        filtered = [
            (x, y)
            for x, y, r in zip(xs, ys, residuals)
            if abs(r) <= threshold
        ]

        if len(filtered) < max(4, self._eta_min_samples // 2):
            return slope

        fx, fy = zip(*filtered)
        return self._linear_slope(list(fx), list(fy))

    def _estimate_remaining_battery_time_seconds(self):
        if len(self._history) < self._eta_min_samples:
            return self._eta_ema_seconds

        window_s = self._history[-1][0] - self._history[0][0]
        if window_s < self._eta_min_window_s:
            return self._eta_ema_seconds

        t0 = self._history[0][0]
        xs = [p[0] - t0 for p in self._history]
        ys = [p[1] for p in self._history]

        slope = self._robust_slope(xs, ys)
        if slope is None:
            return self._eta_ema_seconds

        # Ignore tiny positive/negative drift caused by sensor noise.
        if slope >= -self._eta_slope_deadband:
            return self._eta_ema_seconds

        tail = ys[-5:] if len(ys) >= 5 else ys
        current_percent = self._median(tail)
        if current_percent is None:
            return self._eta_ema_seconds
        if current_percent <= 0:
            self._eta_ema_seconds = 0.0
            return 0.0

        raw_eta = current_percent / (-slope)
        raw_eta = max(0.0, min(raw_eta, self._eta_max_seconds))

        if self._eta_ema_seconds is None:
            self._eta_ema_seconds = raw_eta
            return self._eta_ema_seconds

        lower = self._eta_ema_seconds * (1.0 - self._eta_jump_limit)
        upper = self._eta_ema_seconds * (1.0 + self._eta_jump_limit)
        limited_eta = min(max(raw_eta, lower), upper)

        self._eta_ema_seconds = (
            self._eta_ema_alpha * limited_eta
            + (1.0 - self._eta_ema_alpha) * self._eta_ema_seconds
        )
        return self._eta_ema_seconds

    def _format_remaining_time_hhmm(self, remaining_seconds):
        if remaining_seconds is None:
            return None

        total_minutes = max(0, int((remaining_seconds + 59) // 60))
        total_minutes = min(total_minutes, (99 * 60) + 59)
        hours = total_minutes // 60
        minutes = total_minutes % 60
        return f"{hours:02d}:{minutes:02d}"

    def _print_debug_inline(self, voltage, current, power, percent, remaining_hhmm):
        remaining_text = remaining_hhmm if remaining_hhmm is not None else "--:--"
        line = (
            f"UPS_DEBUG V={voltage:.3f}V I={current:.3f}A P={power:.3f}W "
            f"SOC={percent:6.2f}% T={remaining_text}"
        )
        pad = " " * max(0, self._last_debug_len - len(line))
        print(f"\r{line}{pad}", end="", flush=True)
        self._last_debug_len = len(line)

    def _read_metrics(self):
        voltage = self.ina219.get_bus_voltage_v()
        current = self.ina219.get_current_ma() / 1000.0
        power = self.ina219.get_power_w()
        percent = self._compute_percent(voltage)
        return voltage, current, power, percent

    def _publish_metrics(self):
        ts = time.time()
        voltage, current, power, percent = self._read_metrics()
        self._update_history(ts, percent)
        remaining_s = self._estimate_remaining_battery_time_seconds()
        remaining_hhmm = self._format_remaining_time_hhmm(remaining_s)

        payload = {
            "agent_status": "idle",
            "side": self.side,
            "info": {
                "voltage": round(float(voltage), 3),
                "current": round(float(current), 3),
                "power": round(float(power), 3),
                "percent": round(float(percent), 1),
                "remaining_battery_time": remaining_hhmm,
            }
        }

        self.agent.publish(payload, self.pub_topic)
        self._print_debug_inline(voltage, current, power, percent, remaining_hhmm)

    def run(self):
        period_s = max(self.health_status_period, 50) / 1000.0

        while True:
            now = time.time()
            if now - self._last_publish_ts >= period_s:
                try:
                    self._publish_metrics()
                except Exception as exc:
                    self.agent.publish({"agent_status": "shutdown", "error": str(exc)}, self.pub_topic)
                self._last_publish_ts = now

            time.sleep(0.01)


def main():
    parser = argparse.ArgumentParser(description="UPS HAT MADS agent")
    parser.add_argument("-s", "--server", default="tcp://localhost:9092",
                        help="Broker URL (default: tcp://localhost:9092)")
    parser.add_argument("-o", "--options", default="side=unknown",
                        help="crutch side (default: side=unknown)")
    args = parser.parse_args()

    agent = None
    exit_code = 0
    try:
        agent = UpsHatAgent(broker_url=args.server, options=args.options)
        agent.run()
    except KeyboardInterrupt:
        exit_code = 0
    except Exception as exc:
        sys.stderr.write(f"Error running UpsHatAgent: {exc}\n")
        exit_code = 1
    finally:
        if agent is not None:
            try:
                agent.agent.disconnect()
            except Exception:
                pass
        sys.exit(exit_code)


if __name__ == "__main__":
    main()
