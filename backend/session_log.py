"""Audit log persistence with SQLite primary storage and JSONL fallback."""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

_lock = threading.Lock()

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_LOG_FILE = _DATA_DIR / "audit_sessions.jsonl"
_DB_FILE = _DATA_DIR / "audit_sessions.db"


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_db() -> None:
    with sqlite3.connect(_DB_FILE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                logged_at TEXT NOT NULL,
                phone TEXT,
                room_url TEXT,
                risk_band TEXT,
                risk_score INTEGER,
                offer_status TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_sessions_logged_at ON audit_sessions(logged_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_sessions_risk ON audit_sessions(risk_band, risk_score)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_sessions_offer ON audit_sessions(offer_status)"
        )


def _append_jsonl(record: dict) -> None:
    line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
    with open(_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)


def append_session_record(payload: dict) -> str:
    """
    Persist one session record. Returns generated session_id if not provided.
    """
    _ensure_dir()
    record = dict(payload)
    sid = record.get("session_id") or str(uuid.uuid4())
    record["session_id"] = sid
    record["logged_at"] = datetime.now(timezone.utc).isoformat()

    risk = record.get("risk") or {}
    offer = record.get("offer") or {}
    risk_band = risk.get("risk_band")
    risk_score = risk.get("risk_score")
    offer_status = offer.get("status")

    with _lock:
        try:
            _ensure_db()
            with sqlite3.connect(_DB_FILE) as conn:
                conn.execute(
                    """
                    INSERT INTO audit_sessions (
                        session_id, logged_at, phone, room_url, risk_band, risk_score, offer_status, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        logged_at = excluded.logged_at,
                        phone = excluded.phone,
                        room_url = excluded.room_url,
                        risk_band = excluded.risk_band,
                        risk_score = excluded.risk_score,
                        offer_status = excluded.offer_status,
                        payload_json = excluded.payload_json
                    """,
                    (
                        sid,
                        record["logged_at"],
                        record.get("phone"),
                        record.get("room_url"),
                        risk_band,
                        int(risk_score) if isinstance(risk_score, (int, float)) else None,
                        offer_status,
                        json.dumps(record, ensure_ascii=False, default=str),
                    ),
                )
            if os.environ.get("AUDIT_WRITE_JSONL_COPY", "false").lower() == "true":
                _append_jsonl(record)
        except sqlite3.Error:
            _append_jsonl(record)
    return sid


def read_recent_sessions(limit: int = 20) -> list[dict]:
    """Return most recent session records (newest first), best-effort."""
    with _lock:
        try:
            _ensure_db()
            with sqlite3.connect(_DB_FILE) as conn:
                cur = conn.execute(
                    """
                    SELECT payload_json
                    FROM audit_sessions
                    ORDER BY datetime(logged_at) DESC
                    LIMIT ?
                    """,
                    (max(1, limit),),
                )
                rows = cur.fetchall()
            out: list[dict] = []
            for (payload_json,) in rows:
                try:
                    out.append(json.loads(payload_json))
                except json.JSONDecodeError:
                    continue
            if out:
                return out
        except sqlite3.Error:
            pass

        if not _LOG_FILE.is_file():
            return []
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


def read_session_by_id(session_id: str) -> dict | None:
    """Return one session record by session_id, best-effort."""
    sid = (session_id or "").strip()
    if not sid:
        return None

    with _lock:
        try:
            _ensure_db()
            with sqlite3.connect(_DB_FILE) as conn:
                cur = conn.execute(
                    """
                    SELECT payload_json
                    FROM audit_sessions
                    WHERE session_id = ?
                    LIMIT 1
                    """,
                    (sid,),
                )
                row = cur.fetchone()
            if row and row[0]:
                try:
                    return json.loads(row[0])
                except json.JSONDecodeError:
                    return None
        except sqlite3.Error:
            pass

        if not _LOG_FILE.is_file():
            return None
        try:
            with open(_LOG_FILE, "r", encoding="utf-8") as f:
                for line in reversed(f.readlines()[-2000:]):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if row.get("session_id") == sid:
                        return row
        except OSError:
            return None
    return None
