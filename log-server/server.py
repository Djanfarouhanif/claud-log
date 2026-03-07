"""
Claude Log Bridge - Local Log Server
"""

import json
import os
import sys
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Configuration ────────────────────────────────────────────────────────────

HOST = "127.0.0.1"
PORT = 8765
MAX_MEMORY_LOGS = 500

LOG_JSONL_FILE = Path("browser_logs.json")

# Chemin du txt — peut être changé dynamiquement via POST /config
_project_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get("PROJECT_DIR", ""))

if _project_dir and _project_dir.exists():
    LOG_TXT_FILE = _project_dir / ".devtools" / "browser_logs.txt"
else:
    LOG_TXT_FILE = Path("../.devtools/browser_logs.txt")

LOG_TXT_FILE.parent.mkdir(parents=True, exist_ok=True)

# ─── In-memory store ──────────────────────────────────────────────────────────

log_store: deque = deque(maxlen=MAX_MEMORY_LOGS)

if LOG_JSONL_FILE.exists():
    for raw in LOG_JSONL_FILE.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if raw:
            try:
                log_store.append(json.loads(raw))
            except Exception:
                pass

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Claude Log Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ───────────────────────────────────────────────────────────────────

class LogEntry(BaseModel):
    type: str
    message: str
    stack: Optional[str] = None
    source: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    timestamp: Optional[str] = None
    url: Optional[str] = None
    tabId: Optional[int] = None
    tabTitle: Optional[str] = None
    network: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"

class ConfigPayload(BaseModel):
    projectDir: str

# ─── Helpers ──────────────────────────────────────────────────────────────────

TYPE_ICONS = {
    "error": "ERROR", "warn": "WARN ", "warning": "WARN ",
    "log": "LOG  ", "info": "INFO ", "debug": "DEBUG",
    "network_error": "NET  ", "unhandledrejection": "REJCT",
}

CLAUDE_MD = (
    "# Browser Log Feed for Claude Code\n\n"
    "When the developer asks you to debug a browser error, read the log file below\n"
    "before responding. It contains real-time output captured from the browser console.\n\n"
    "## Log File\n\n"
    ".devtools/browser_logs.txt\n\n"
    "## Log Format\n\n"
    "[ISO-TIMESTAMP] [TYPE ] message  (page url)\n"
    "          optional stack trace\n"
    "          Network: METHOD url → STATUS statusText\n\n"
    "## Types\n\n"
    "- LOG   — console.log\n"
    "- WARN  — console.warn\n"
    "- ERROR — console.error / window.onerror\n"
    "- INFO  — console.info\n"
    "- DEBUG — console.debug\n"
    "- NET   — failed fetch / XHR\n"
    "- REJCT — unhandled promise rejection\n\n"
    "## How to Use\n\n"
    "When the developer asks 'why is this failing?' or 'what does the error say?':\n"
    "1. Read .devtools/browser_logs.txt\n"
    "2. Find the most recent ERROR or REJCT entries\n"
    "3. Use the stack traces and network details to pinpoint the root cause\n"
    "4. Suggest targeted fixes based on the actual captured logs\n"
)

def set_project_dir(directory: Path):
    global LOG_TXT_FILE
    devtools = directory / ".devtools"
    devtools.mkdir(parents=True, exist_ok=True)
    LOG_TXT_FILE = devtools / "browser_logs.txt"
    if not LOG_TXT_FILE.exists():
        LOG_TXT_FILE.write_text("", encoding="utf-8")
    claude_md = devtools / "CLAUDE.md"
    if not claude_md.exists():
        claude_md.write_text(CLAUDE_MD, encoding="utf-8")
    print(f"  [CONFIG] Project dir set → {directory}", flush=True)
    print(f"  [CONFIG] TXT log → {LOG_TXT_FILE}", flush=True)

# Appliquer le dossier initial si fourni
if _project_dir and _project_dir.exists():
    set_project_dir(_project_dir)

def format_txt_line(entry: dict) -> str:
    ts   = entry.get("timestamp", datetime.utcnow().isoformat())
    icon = TYPE_ICONS.get(entry.get("type", "log"), "LOG  ")
    msg  = entry.get("message", "")
    url  = entry.get("url", "")
    line = f"[{ts}] [{icon}] {msg}"
    if url:
        line += f"  ({url})"
    if entry.get("stack"):
        line += "\n" + "\n".join("          " + l for l in entry["stack"].strip().splitlines())
    if entry.get("network"):
        n = entry["network"]
        line += f"\n          Network: {n.get('method','')} {n.get('requestUrl','')} → {n.get('status','')} {n.get('statusText','')}"
    return line

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "log_count": len(log_store), "txt_file": str(LOG_TXT_FILE.resolve())}


@app.post("/config")
async def set_config(payload: ConfigPayload):
    """L'extension VS Code envoie le chemin du workspace ouvert."""
    directory = Path(payload.projectDir)
    if not directory.exists():
        return {"ok": False, "error": f"Directory not found: {directory}"}
    set_project_dir(directory)
    return {"ok": True, "txtFile": str(LOG_TXT_FILE.resolve())}


@app.post("/log")
async def receive_log(entry: LogEntry):
    data = entry.dict()
    if not data.get("timestamp"):
        data["timestamp"] = datetime.utcnow().isoformat()

    log_store.append(data)

    with LOG_JSONL_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False) + "\n")

    with LOG_TXT_FILE.open("a", encoding="utf-8") as f:
        f.write(format_txt_line(data) + "\n")

    level = data.get("type", "log").upper()[:5]
    print(f"  [{level}] {data['message'][:120]}", flush=True)

    return {"ok": True}


@app.get("/logs")
async def get_logs(limit: int = 50, type: Optional[str] = None):
    result = list(log_store)
    if type:
        result = [e for e in result if e.get("type") == type]
    return {"logs": result[-limit:], "total": len(result)}


@app.delete("/logs")
async def clear_logs():
    log_store.clear()
    LOG_JSONL_FILE.write_text("", encoding="utf-8")
    LOG_TXT_FILE.write_text("", encoding="utf-8")
    return {"ok": True}


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Claude Log Bridge server  →  http://{HOST}:{PORT}")
    print(f"  JSONL : {LOG_JSONL_FILE.resolve()}")
    print(f"  TXT   : {LOG_TXT_FILE.resolve()}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
