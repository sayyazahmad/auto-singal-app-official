"""
dev_server.py
=============
Your local development command center for AutoSignal.

This script now does THREE things:
1. Starts a web server for the frontend that automatically refreshes your
   browser when you save changes to HTML, CSS, or JavaScript files.
2. Runs the backend Python worker (`process_brief_requests.py`) and
   automatically restarts it whenever you save changes to any Python file.
3. Runs a lightweight local API server on a separate port, implementing
   the /api/* routes that app.js calls during the "Connect with YouTube"
   flow and the Channel Audit tab. Without this, those calls 404.

Usage:
  pip install livereload watchdog python-dotenv
  python dev_server.py

Frontend:  http://127.0.0.1:5500
API:       http://127.0.0.1:5501/api/*
"""

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("⚠️ python-dotenv not found. Run 'pip install python-dotenv'.")

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from livereload import Server
from watchdog.observers import Observer
from watchdog.events import PatternMatchingEventHandler

# ── Configuration ──────────────────────────────────────────────────────────
BACKEND_SCRIPT = "process_brief_requests.py"
BACKEND_ARGS = ["--watch", "--interval", "5"]
PYTHON_EXEC = sys.executable
WATCH_PATTERNS = ["*.py"]
WATCH_IGNORE_PATTERNS = ["*/.venv/*", "*/__pycache__/*", "dev_server.py", "run_pipeline.py"]
WATCH_PATH = "."
FRONTEND_PORT = 5500
API_PORT = 5501
ROOT = Path(__file__).resolve().parent

# Maps the scriptId values app.js sends to the actual script filename.
# app.js currently sends {"scriptId": "fetch_channel", "niche": "..."}.
SCRIPT_MAP = {
    "fetch_channel": "fetch_channel_metadata.py",
    "fetch_automotive": "metadata_fetch.py",
    "merge_json": "merge_json.py",
    "semantic_enrich": "semantic_research.py",
    "cluster_intelligence": "cluster_research.py",
    "full_refresh": "run_pipeline.py",
}

# Candidate locations for channel metadata, checked in order.
# Adjust this list if your fetch_channel_metadata.py writes somewhere else.
def _channel_metadata_candidates(niche: str):
    return [
        ROOT / "data" / niche / "channel_metadata.json",
        ROOT / "data" / niche / "creator_channel_metadata.json",
        ROOT / "channel_metadata.json",
    ]


# ── Backend worker process management (unchanged) ───────────────────────────
backend_process = None

def start_backend():
    global backend_process
    if backend_process and backend_process.poll() is None:
        return
    command = [PYTHON_EXEC, BACKEND_SCRIPT] + BACKEND_ARGS
    print(f"🚀 Starting backend worker: {' '.join(command)}")
    backend_process = subprocess.Popen(command)

def stop_backend():
    global backend_process
    if backend_process and backend_process.poll() is None:
        print("🛑 Stopping backend worker...")
        backend_process.terminate()
        try:
            backend_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print("⚠️ Backend worker did not stop in time, killing.")
            backend_process.kill()
        backend_process = None

def restart_backend():
    stop_backend()
    start_backend()

class BackendChangeHandler(PatternMatchingEventHandler):
    def __init__(self):
        super().__init__(patterns=WATCH_PATTERNS, ignore_patterns=WATCH_IGNORE_PATTERNS, ignore_directories=True)
    def on_any_event(self, event):
        print(f"🐍 Backend file changed: {event.src_path}. Restarting worker...")
        restart_backend()


# ── NEW: Local API server ────────────────────────────────────────────────────

class ApiHandler(BaseHTTPRequestHandler):
    """
    Implements the three /api/* routes app.js calls.
    Runs on its own port so it doesn't interfere with livereload's
    static file server on FRONTEND_PORT.
    """

    def log_message(self, fmt, *args):
        print(f"  [api] {self.address_string()} - {fmt % args}")

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        # CORS — frontend (5500) and API (5501) are different origins
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        # CORS preflight
        self._send_json(200, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/api/data/channel_metadata.json":
            niche = (qs.get("niche", ["automotive"]))[0]
            for candidate in _channel_metadata_candidates(niche):
                if candidate.exists():
                    with candidate.open("r", encoding="utf-8") as f:
                        data = json.load(f)
                    self._send_json(200, data)
                    return
            self._send_json(404, {
                "error": f"No channel metadata found for niche '{niche}'. "
                         f"Run the fetch_channel_metadata.py script first, or "
                         f"check _channel_metadata_candidates() paths in dev_server.py."
            })
            return

        self._send_json(404, {"error": f"Unknown route: {parsed.path}"})

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self._read_json_body()

        if parsed.path == "/api/detect-niche":
            channel_id = body.get("channel_id")
            result = self._detect_niche(channel_id)
            self._send_json(200, result)
            return

        if parsed.path == "/api/start-script":
            script_id = body.get("scriptId")
            niche = body.get("niche", "automotive")
            channel_id = body.get("channel_id")  # not currently sent by app.js — see note below
            result = self._start_script(script_id, niche, channel_id)
            self._send_json(200, result)
            return

        self._send_json(404, {"error": f"Unknown route: {parsed.path}"})

    # ── Route implementations ────────────────────────────────────────────

    def _detect_niche(self, channel_id: str | None) -> dict:
        """
        Best-effort call into niche_detector.py.
        I don't have that file's exact function signature in front of me —
        this tries the most likely entrypoint and falls back safely.
        Paste niche_detector.py and I'll wire this exactly.
        """
        try:
            result = subprocess.run(
                [PYTHON_EXEC, "niche_detector.py", "--channel", channel_id or ""],
                cwd=str(ROOT), capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout.strip():
                parsed = json.loads(result.stdout.strip().splitlines()[-1])
                return {
                    "niche": parsed.get("niche", "automotive"),
                    "display_name": parsed.get("display_name", "Automotive"),
                    "confidence": parsed.get("confidence", 0),
                }
        except Exception as e:
            print(f"  [api] niche detection fallback ({e})")

        return {"niche": "automotive", "display_name": "Automotive", "confidence": 0}

    def _start_script(self, script_id: str | None, niche: str, channel_id: str | None) -> dict:
        """
        Fires the actual pipeline script in the background — does NOT block
        the HTTP response on a 2-3 minute pipeline run.
        """
        script_file = SCRIPT_MAP.get(script_id)
        if not script_file:
            return {"status": "error", "error": f"Unknown scriptId: {script_id}"}

        script_path = ROOT / script_file
        if not script_path.exists():
            return {"status": "error", "error": f"Script not found: {script_file}"}

        command = [PYTHON_EXEC, str(script_path), "--niche", niche]
        if channel_id:
            command += ["--channel", channel_id]

        print(f"🚀 [api] Launching background script: {' '.join(command)}")
        subprocess.Popen(command, cwd=str(ROOT))
        return {"status": "started", "script": script_file, "niche": niche}


def start_api_server():
    server = ThreadingHTTPServer(("localhost", API_PORT), ApiHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"🔌 API server running at http://localhost:{API_PORT}/api/*")
    return server


# ── Main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    start_backend()

    observer = Observer()
    observer.schedule(BackendChangeHandler(), WATCH_PATH, recursive=True)
    observer.start()
    print(f"👀 Watching for backend changes in '{WATCH_PATH}'...")

    start_api_server()

    server = Server()
    server.watch('**/*.html')
    server.watch('**/*.js')
    server.watch('**/*.css')
    print(f"🌍 Starting frontend server at http://localhost:{FRONTEND_PORT}")
    server.serve(port=FRONTEND_PORT, root='.', open_url_delay=1, host="localhost")

    stop_backend()
    observer.stop()
    observer.join()
    print("All services stopped. Goodbye!")
