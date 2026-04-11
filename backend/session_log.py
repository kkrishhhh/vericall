"""Append-only JSONL audit log for onboarding sessions (no DB required)."""

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

_lock = threading.Lock()

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_LOG_FILE = _DATA_DIR / "audit_sessions.jsonl"


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def append_session_record(payload: dict) -> str:
    """
    Persist one session record. Returns generated session_id if not provided.
    """
    _ensure_dir()
    record = dict(payload)
    sid = record.get("session_id") or str(uuid.uuid4())
    record["session_id"] = sid
    record["logged_at"] = datetime.now(timezone.utc).isoformat()

    line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
    with _lock:
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    return sid


def read_recent_sessions(limit: int = 20) -> list[dict]:
    """Return most recent session records (newest first), best-effort."""
    if not _LOG_FILE.is_file():
        return []
    lines: list[str] = []
    with _lock:
        try:
            with open(_LOG_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except OSError:
            return []

    out: list[dict] = []
    for line in reversed(lines[-500:]):  # cap read for demo
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
        if len(out) >= limit:
            break
    return out
