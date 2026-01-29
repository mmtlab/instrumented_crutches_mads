import sys, os
import subprocess
mads_path = subprocess.check_output(["mads", "-p"], text=True).strip()
sys.path.append(os.path.join(mads_path, 'python'))

from mads_agent import Agent, EventType, MessageType, mads_version, mads_default_settings_uri

agent = Agent("web_server", "tcp://localhost:9092") # then the mads.ini file MUST have a python_agent section!
agent.set_id("web_server")
agent.set_settings_timeout(2000) # 2 sec timeout
if agent.init() != 0:
    sys.stderr.write("Cannot contact broker\n")
    exit
print(agent.settings()) # received from the broker
agent.connect()


msg = {"value": 10, "list": [1, 2, 3]}
topic = "ws_command"
agent.publish(topic, msg)


agent.set_receive_timeout(2000) # Timeout for receiving messages, in ms
r = agent.receive()
if r == MessageType.NONE:
    sys.stderr.write("No message received\n")
else:
    lm = agent.last_message()
    print(f"from topic {lm[0]} got: {lm[1]}\n")

agent.disconnect()