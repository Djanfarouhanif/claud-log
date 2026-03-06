"""
Claude Log Bridge - Local Log Server
=====================================
Receives JSON log entries from the browser extension and:
  1. Stores them in browser_logs.json (full structured history)
  2. Appends human-readable lines to .devtools/browser_logs.txt (for Claude Code)
  3. Keeps the latest N entries in memory for the /logs endpoint

Run:
    pip install fastapi uvicorn
    python server.py
"""

import json
import os
import sys
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Configuration ────────────────────────────────────────────────────────────

HOST = "127.0.0.1"
PORT = 8765
MAX_MEMORY_LOGS = 500       # keep last N in memory
LOG_JSON_FILE = Path("browser_logs.json")
LOG_TXT_FILE = Path("../.devtools/browser_logs.txt")  # Claude Code reads this

# Ensure output directories exist
LOG_TXT_FILE.parent.mkdir(parents=True, exist_ok=True)

# ─── In-memory store ──────────────────────────────────────────────────────────

log_store: deque = deque(maxlen=MAX_MEMORY_LOGS)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Claude Log Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # browser extension origin varies
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ─── Models ───────────────────────────────────────────────────────────────────

class LogEntry(BaseModel):
    type: str                          # log | warn | error | info | debug | network_error | unhandledrejection
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
        extra = "allow"              # accept any extra fields the extension adds

# ─── Helpers ──────────────────────────────────────────────────────────────────

TYPE_ICONS = {
    "error": "ERROR",
    "warn": "WARN ",
    "warning": "WARN ",
    "log": "LOG  ",
    "info": "INFO ",
    "debug": "DEBUG",
    "network_error": "NET  ",
    "unhandledrejection": "REJCT",
}


def format_txt_line(entry: dict) -> str:
    """Format a single log entry as a human-readable line for Claude Code."""
    ts = entry.get("timestamp", datetime.utcnow().isoformat())
    icon = TYPE_ICONS.get(entry.get("type", "log"), "LOG  ")
    url = entry.get("url", "")
    msg = entry.get("message", "")
    line = f"[{ts}] [{icon}] {msg}"
    if url:
        line += f"  ({url})"
    if entry.get("stack"):
        # Indent stack trace lines
        stack_lines = entry["stack"].strip().splitlines()
        line += "\n" + "\n".join("          " + l for l in stack_lines)
    if entry.get("network"):
        n = entry["network"]
        line += f"\n          Network: {n.get('method','')} {n.get('requestUrl','')} → {n.get('status','')} {n.get('statusText','')}"
    return line


def persist_json(entry: dict):
    """Append entry to the JSON log file."""
    entries = []
    if LOG_JSON_FILE.exists():
        try:
            entries = json.loads(LOG_JSON_FILE.read_text(encoding="utf-8"))
        except Exception:
            entries = []
    entries.append(entry)
    LOG_JSON_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")


def persist_txt(entry: dict):
    """Append formatted line to the human-readable txt file for Claude Code."""
    line = format_txt_line(entry)
    with LOG_TXT_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "log_count": len(log_store)}


@app.post("/log")
async def receive_log(entry: LogEntry):
    data = entry.dict()
    if not data.get("timestamp"):
        data["timestamp"] = datetime.utcnow().isoformat()

    log_store.append(data)
    persist_json(data)
    persist_txt(data)

    level = data.get("type", "log").upper()[:5]
    print(f"  [{level}] {data['message'][:120]}", flush=True)

    return {"ok": True}


@app.get("/logs")
async def get_logs(
    limit: int = 50,
    type: Optional[str] = None,
):
    """Return recent logs, optionally filtered by type."""
    result = list(log_store)
    if type:
        result = [e for e in result if e.get("type") == type]
    return {"logs": result[-limit:], "total": len(result)}


@app.delete("/logs")
async def clear_logs():
    """Clear all in-memory logs and reset the files."""
    log_store.clear()
    LOG_JSON_FILE.write_text("[]", encoding="utf-8")
    LOG_TXT_FILE.write_text("", encoding="utf-8")
    return {"ok": True, "message": "Logs cleared"}


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Claude Log Bridge server starting on http://{HOST}:{PORT}")
    print(f"  JSON log : {LOG_JSON_FILE.resolve()}")
    print(f"  Text log : {LOG_TXT_FILE.resolve()}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
