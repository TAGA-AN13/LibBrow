"""LibBrow desktop service launcher (Windows, Python 3 + Tkinter)."""

from __future__ import annotations

import os
import queue
import re
import shutil
import socket
import subprocess
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import messagebox, ttk


ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs" / "launcher"
NAVY = "#14233A"
BLUE = "#2B5685"
GOLD = "#E2BB61"
BG = "#F4F8FC"
INK = "#203650"
MUTED = "#657A92"
GREEN = "#25815F"
RED = "#B14A4A"

SERVICES = {
    "api": {
        "label": "API service",
        "script": "dev",
        "port": 3000,
        "url": "http://localhost:3000/health",
        "log": "api.log",
    },
    "customer": {
        "label": "Borrower website",
        "script": "dev:customer",
        "port": 5173,
        "url": "http://localhost:5173/",
        "log": "borrower.log",
    },
    "admin": {
        "label": "Admin portal",
        "script": "dev:admin",
        "port": 5174,
        "url": "http://localhost:5174/?launcher=1",
        "log": "admin.log",
    },
}


def service_is_ready(url: str) -> bool:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "LibBrowLauncher/1.0"})
        with urllib.request.urlopen(request, timeout=0.7):
            return True
    except (OSError, urllib.error.URLError, TimeoutError):
        return False


def port_is_open(port: int) -> bool:
    """Check whether a local TCP port has a listener, closing the probe socket."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.3)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def listening_processes(port: int) -> list[str]:
    """Return listener PIDs, when Windows exposes them through netstat."""
    netstat = shutil.which("netstat.exe") or shutil.which("netstat")
    if not netstat:
        return []
    try:
        result = subprocess.run(
            [netstat, "-ano", "-p", "tcp"], capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=2, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    pattern = re.compile(rf"^\s*TCP\s+\S+:{port}\s+\S+\s+LISTENING\s+(\d+)\s*$", re.I)
    return sorted({match.group(1) for line in result.stdout.splitlines() if (match := pattern.match(line))})


class LibBrowLauncher:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.messages: queue.Queue[tuple[str, str, str]] = queue.Queue()
        self.processes: dict[str, subprocess.Popen[bytes]] = {}
        self.log_handles: dict[str, object] = {}
        self.starting: set[str] = set()
        self.lock = threading.Lock()
        self.poll_running = False

        root.title("LibBrow Desktop Launcher")
        root.geometry("800x610")
        root.minsize(720, 560)
        root.configure(bg=BG)
        root.protocol("WM_DELETE_WINDOW", self.close)

        self._build_ui()
        self.root.after(200, self._drain_messages)
        self.root.after(1200, self._poll_status)

    def _build_ui(self) -> None:
        header = tk.Frame(self.root, bg=NAVY, padx=28, pady=18)
        header.pack(fill="x")
        tk.Label(header, text="LibBrow Desktop Launcher", bg=NAVY, fg="white",
                 font=("Segoe UI", 21, "bold")).pack(anchor="w")
        tk.Label(header, text="Start your library system and open either portal.",
                 bg=NAVY, fg="#CCD9E7", font=("Segoe UI", 10)).pack(anchor="w", pady=(3, 0))

        body = tk.Frame(self.root, bg=BG, padx=28, pady=20)
        body.pack(fill="both", expand=True)
        tk.Label(body, text="Services", bg=BG, fg=NAVY,
                 font=("Segoe UI", 14, "bold")).pack(anchor="w", pady=(0, 8))

        status_box = tk.Frame(body, bg="white", highlightthickness=1, highlightbackground="#DCE6F0")
        status_box.pack(fill="x")
        self.status_labels: dict[str, tk.Label] = {}
        for key, service in SERVICES.items():
            row = tk.Frame(status_box, bg="white", padx=14, pady=8)
            row.pack(fill="x")
            dot = tk.Label(row, text="●", bg="white", fg="#94A3B8", font=("Segoe UI", 11))
            dot.pack(side="left")
            tk.Label(row, text=service["label"], bg="white", fg=INK,
                     font=("Segoe UI", 10), anchor="w").pack(side="left", padx=(12, 0))
            state = tk.Label(row, text="Stopped", bg="white", fg=MUTED,
                             font=("Segoe UI", 10), anchor="e", width=20)
            state.pack(side="right")
            self.status_labels[key] = state
            setattr(state, "dot_label", dot)

        buttons = tk.Frame(body, bg=BG)
        buttons.pack(fill="x", pady=(20, 10))
        for column in range(3):
            buttons.grid_columnconfigure(column, weight=1, uniform="buttons")

        self._button(buttons, "Start all services", self.start_all, GOLD, NAVY, 0, 0)
        self._button(buttons, "Start API", lambda: self.start_one("api"), BLUE, "white", 0, 1)
        self._button(buttons, "Start borrower site", lambda: self.start_one("customer"), BLUE, "white", 0, 2)
        self._button(buttons, "Start admin portal", lambda: self.start_one("admin"), BLUE, "white", 1, 0)
        self._button(buttons, "Stop launched services", self.stop_all, RED, "white", 1, 1)
        self._button(buttons, "Open borrower website", lambda: self.open_site("customer"), "#DCE6F0", NAVY, 1, 2)
        self._button(buttons, "Open admin portal", lambda: self.open_site("admin"), "#DCE6F0", NAVY, 2, 0)
        self._button(buttons, "Open service logs", self.open_logs, "#DCE6F0", NAVY, 2, 1)

        self.message = tk.Label(body, text="Start all services, then open a portal. Logs are saved in logs\\launcher.",
                                bg=BG, fg=MUTED, font=("Segoe UI", 9), anchor="w", justify="left", wraplength=730)
        self.message.pack(fill="x", pady=(6, 0))
        tk.Label(body, text="LibBrow  ·  Borrow  ·  Read  ·  Discover", bg=BG, fg="#8796A8",
                 font=("Segoe UI", 9)).pack(side="bottom", anchor="w", pady=(12, 0))

    @staticmethod
    def _button(parent: tk.Widget, text: str, command, background: str, foreground: str,
                row: int, column: int) -> None:
        button = tk.Button(parent, text=text, command=command, bg=background, fg=foreground,
                           activebackground=background, activeforeground=foreground,
                           relief="flat", borderwidth=0, cursor="hand2",
                           font=("Segoe UI", 10, "bold"), padx=10, pady=11)
        button.grid(row=row, column=column, sticky="ew", padx=(0 if column == 0 else 6, 6), pady=5)

    def _setup_issues(self) -> list[str]:
        issues = []
        if not (shutil.which("node.exe") or shutil.which("node")):
            issues.append("Node.js was not found on PATH. Install Node.js 20.19 or newer.")
        if not (shutil.which("npm.cmd") or shutil.which("npm")):
            issues.append("npm was not found on PATH. Reinstall Node.js with npm enabled.")
        if not (ROOT / "node_modules").is_dir():
            issues.append("Root dependencies are missing. Run npm install in the project folder.")
        if not (ROOT / "frontend" / "node_modules").is_dir():
            issues.append("Frontend dependencies are missing. Run npm install in the frontend folder.")
        if not (ROOT / ".env").is_file():
            issues.append("Root .env is missing. Copy .env.example to .env and configure the API.")
        if not (ROOT / "frontend" / ".env").is_file():
            issues.append("frontend/.env is missing. Copy frontend/.env.example to frontend/.env.")
        return issues

    def start_all(self) -> None:
        issues = self._setup_issues()
        if issues:
            messagebox.showerror("Setup needed", "\n\n".join(issues), parent=self.root)
            return
        for key in SERVICES:
            self.start_one(key, validate=False)

    def start_one(self, key: str, validate: bool = True) -> None:
        if validate:
            issues = self._setup_issues()
            if issues:
                messagebox.showerror("Setup needed", "\n\n".join(issues), parent=self.root)
                return
        with self.lock:
            if key in self.starting:
                return
            process = self.processes.get(key)
            if process and process.poll() is None:
                return
            self.starting.add(key)
        self._set_status(key, "Starting…", GOLD)
        threading.Thread(target=self._start_worker, args=(key,), daemon=True).start()

    def _start_worker(self, key: str) -> None:
        service = SERVICES[key]
        try:
            if service_is_ready(service["url"]):
                self.messages.put((key, "Ready (already running)", GREEN))
                self.message_after("This service was already running; the launcher did not start a duplicate.")
                return

            if port_is_open(service["port"]):
                pids = listening_processes(service["port"])
                owner = f" PID {', '.join(pids)}" if pids else ""
                self.messages.put((key, "Port busy", RED))
                self.message_after(f"Port {service['port']} is occupied{owner}. Stop the server in its terminal with Ctrl+C, then retry.")
                return

            LOG_DIR.mkdir(parents=True, exist_ok=True)
            log_handle = (LOG_DIR / service["log"]).open("a", encoding="utf-8", buffering=1)
            command = f'npm.cmd run {service["script"]}'
            process = subprocess.Popen(
                command,
                cwd=ROOT,
                shell=True,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                | getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            with self.lock:
                self.processes[key] = process
                self.log_handles[key] = log_handle
            self.messages.put((key, "Starting…", GOLD))
        except (OSError, subprocess.SubprocessError) as error:
            self.messages.put((key, "Failed", RED))
            self.message_after(f"Could not launch {service['label']}: {error}")
        finally:
            with self.lock:
                self.starting.discard(key)

    def message_after(self, text: str) -> None:
        self.messages.put(("__message__", text, ""))

    def stop_all(self) -> None:
        with self.lock:
            processes = list(self.processes.items())
            self.processes.clear()
            handles = list(self.log_handles.values())
            self.log_handles.clear()
        for key, process in processes:
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                                   capture_output=True, check=False)
                else:
                    process.terminate()
            self.messages.put((key, "Stopped", MUTED))
        for handle in handles:
            try:
                handle.close()
            except OSError:
                pass
        self.message_after("Stopped services launched by this panel. Existing external services were left running.")

    def open_site(self, key: str) -> None:
        webbrowser.open(SERVICES[key]["url"])

    def open_logs(self) -> None:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(LOG_DIR)  # type: ignore[attr-defined]
        else:
            webbrowser.open(LOG_DIR.as_uri())

    def _set_status(self, key: str, text: str, color: str) -> None:
        label = self.status_labels[key]
        label.configure(text=text, fg=color)
        label.dot_label.configure(fg=color)

    def _poll_status(self) -> None:
        if not self.poll_running:
            self.poll_running = True
            threading.Thread(target=self._poll_worker, daemon=True).start()
        self.root.after(1600, self._poll_status)

    def _poll_worker(self) -> None:
        try:
            for key, service in SERVICES.items():
                if service_is_ready(service["url"]):
                    self.messages.put((key, "Ready", GREEN))
                    continue
                with self.lock:
                    process = self.processes.get(key)
                if process and process.poll() is None:
                    self.messages.put((key, "Starting…", GOLD))
                elif port_is_open(service["port"]):
                    self.messages.put((key, "Port busy", RED))
                else:
                    if process:
                        with self.lock:
                            self.processes.pop(key, None)
                            handle = self.log_handles.pop(key, None)
                        if handle:
                            handle.close()
                    self.messages.put((key, "Stopped", MUTED))
        finally:
            self.poll_running = False

    def _drain_messages(self) -> None:
        while True:
            try:
                key, text, color = self.messages.get_nowait()
            except queue.Empty:
                break
            if key == "__message__":
                self.message.configure(text=text)
            elif key in self.status_labels:
                self._set_status(key, text, color)
        self.root.after(200, self._drain_messages)

    def close(self) -> None:
        self.stop_all()
        self.root.after(150, self.root.destroy)


def main() -> None:
    root = tk.Tk()
    LibBrowLauncher(root)
    root.mainloop()


if __name__ == "__main__":
    main()
