import tkinter as tk
from tkinter import messagebox
import threading

from run_data_recording import start_recording, stop_recording

recording_thread = None
is_recording = False
stop_event = None

FONT = ("Arial", 16, "bold")
BTN_START_COLOR = "#228B22"   # Verdone
BTN_STOP_COLOR = "#8B0000"    # Rosso scuro
BTN_TEXT_COLOR = "#FFFFFF"

def threaded_start_recording(subject, session, condition, run, use_external_camera, stop_event):
    global is_recording
    try:
        start_recording(
            subject=int(subject),
            session=int(session),
            condition=int(condition),
            run=int(run),
            use_external_camera=use_external_camera,
            stop_event=stop_event
        )
    except Exception as e:
        messagebox.showerror("Error", f"Recording error:\n{e}")
    finally:
        is_recording = False
        btn_start.config(
            text="Start recording",
            bg=BTN_START_COLOR,
            fg=BTN_TEXT_COLOR,
            font=FONT,
            command=on_start
        )

def on_start():
    global recording_thread, is_recording, stop_event
    subject = entry_subject.get()
    session = entry_session.get()
    condition = entry_condition.get()
    run = entry_run.get()
    use_external_camera = var_external_camera.get()

    if not subject or not session or not condition or not run:
        messagebox.showerror("Error", "Please fill in all fields!")
        return

    if is_recording:
        messagebox.showinfo("Info", "Recording already in progress.")
        return

    is_recording = True
    stop_event = threading.Event()
    btn_start.config(
        text="Stop recording",
        bg=BTN_STOP_COLOR,
        fg=BTN_TEXT_COLOR,
        font=FONT,
        command=on_stop
    )
    # Disable all input fields and checkbox during acquisition
    entry_subject.config(state="disabled")
    entry_session.config(state="disabled")
    entry_condition.config(state="disabled")
    entry_run.config(state="disabled")
    chk_external_camera.config(state="disabled")

    recording_thread = threading.Thread(
        target=threaded_start_recording,
        args=(subject, session, condition, run, use_external_camera, stop_event),
        daemon=True
    )
    recording_thread.start()

def on_stop():
    global is_recording, stop_event
    if is_recording and stop_event is not None:
        stop_recording(stop_event=stop_event)
        is_recording = False
        btn_start.config(
            text="Start recording",
            bg=BTN_START_COLOR,
            fg=BTN_TEXT_COLOR,
            font=FONT,
            command=on_start
        )
        # Re-enable all input fields and checkbox after acquisition
        entry_subject.config(state="normal")
        entry_session.config(state="normal")
        entry_condition.config(state="normal")
        entry_run.config(state="normal")
        chk_external_camera.config(state="normal")
        # Increment run number automatically
        try:
            current_run = int(entry_run.get())
            entry_run.delete(0, tk.END)
            entry_run.insert(0, str(current_run + 1))
        except Exception:
            pass

root = tk.Tk()
root.title("Data Recording - GUI")

label_opts = {"font": FONT}
entry_opts = {"font": FONT}
chk_opts = {"font": FONT}

tk.Label(root, text="Subject:", **label_opts).grid(row=0, column=0, sticky="e")
entry_subject = tk.Entry(root, **entry_opts)
entry_subject.insert(0, "0")
entry_subject.grid(row=0, column=1)

tk.Label(root, text="Session:", **label_opts).grid(row=1, column=0, sticky="e")
entry_session = tk.Entry(root, **entry_opts)
entry_session.insert(0, "0")
entry_session.grid(row=1, column=1)

tk.Label(root, text="Condition:", **label_opts).grid(row=2, column=0, sticky="e")
entry_condition = tk.Entry(root, **entry_opts)
entry_condition.insert(0, "0")
entry_condition.grid(row=2, column=1)

tk.Label(root, text="Run:", **label_opts).grid(row=3, column=0, sticky="e")
entry_run = tk.Entry(root, **entry_opts)
entry_run.insert(0, "0")
entry_run.grid(row=3, column=1)

var_external_camera = tk.BooleanVar(value=True)
chk_external_camera = tk.Checkbutton(root, text="Use external camera", variable=var_external_camera, **chk_opts)
chk_external_camera.grid(row=4, column=0, columnspan=2)

btn_start = tk.Button(
    root,
    text="Start recording",
    bg=BTN_START_COLOR,
    fg=BTN_TEXT_COLOR,
    font=FONT,
    command=on_start
)
btn_start.grid(row=10, column=0, columnspan=2, pady=20, ipadx=20, ipady=10)

root.mainloop()
