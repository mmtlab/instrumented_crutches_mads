# Instrumented Crutches

Simple instrument panel for Raspberry Pi. Local demo only.

## Run

```bash
pip install -r requirements.txt
python main.py
```

Open in browser: `http://localhost:8000`

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
