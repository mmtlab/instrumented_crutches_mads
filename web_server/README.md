# Instrumented Crutches

Simple instrument panel for Raspberry Pi. Local demo only.

## Setup

```bash
# create and activate venv (recommended)
python3 -m venv venv
source venv/bin/activate

# install deps
pip install -r requirements.txt
```

If you must install system-wide on Raspberry Pi, use `pip install -r requirements.txt --break-system-packages` (not recommended).

## Run

```bash
python web_server.py
```

Then open `http://localhost:8000` in your browser.

## Pages

- **Record** - Start/stop recordings
- **View Data** - Display recorded data

## API

- `POST /start` - Start recording
- `POST /stop` - Stop recording
- `GET /acquisitions` - List recordings
- `GET /acquisitions/{id}` - Get data

## Notes

Plain HTTP, no security, local network only.

### Autostart on Raspberry Pi (systemd)

Create `/etc/systemd/system/instrumented-crutches.service`:

```ini
[Unit]
Description=Instrumented Crutches
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/instrumented_crutches
ExecStart=/home/pi/instrumented_crutches/venv/bin/python main.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl enable instrumented-crutches.service
sudo systemctl start instrumented-crutches.service
```
