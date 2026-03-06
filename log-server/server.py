"""
Claude Log Bridge - Local Log Server
"""

import json
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

LOG_JSONL_FILE = Path("browser_logs.jsonl")
LOG_TXT_FILE   = Path("../.devtools/browser_logs.txt")

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

# allow_methods=["*"] is required — listing methods explicitly does NOT make
# Starlette respond with 200 to OPTIONS preflight for DELETE requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Model ────────────────────────────────────────────────────────────────────

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

# ─── Helpers ──────────────────────────────────────────────────────────────────

TYPE_ICONS = {
    "error": "ERROR", "warn": "WARN ", "warning": "WARN ",
    "log": "LOG  ", "info": "INFO ", "debug": "DEBUG",
    "network_error": "NET  ", "unhandledrejection": "REJCT",
}

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
    return {"status": "ok", "log_count": len(log_store)}


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
