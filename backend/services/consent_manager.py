"""Consent Manager — DPDPA Compliance Infrastructure.

Records granular consent for VIDEO_RECORDING, DATA_PROCESSING, and
KYC_VERIFICATION separately. Stored in a dedicated SQLite table
`consent_records` for regulatory audit.

References:
- Digital Personal Data Protection Act 2023 (DPDPA) Section 6
- RBI V-CIP Master Direction 2016 — consent requirements
"""

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums & Models ──────────────────────────────────────────────

class ConsentType(str, Enum):
    VIDEO_RECORDING = "VIDEO_RECORDING"
    DATA_PROCESSING = "DATA_PROCESSING"
    KYC_VERIFICATION = "KYC_VERIFICATION"


class ConsentRecord(BaseModel):
    """Individual consent record — one per consent type per session."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    phone_hash: str = ""                       # SHA-256 hash of phone (never raw)
    consent_type: ConsentType
    consent_given: bool
    consent_timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    consent_text_version: str = "v1.0"         # Version of the consent text shown to user
    ip_address: str = ""
    user_agent: str = ""


class RecordConsentRequest(BaseModel):
    """Request body for POST /api/consent/record."""
    session_id: str
    phone_hash: str = ""
    consent_type: ConsentType
    consent_given: bool
    consent_text_version: str = "v1.0"
    ip_address: str = ""
    user_agent: str = ""


# ── Storage ─────────────────────────────────────────────────────

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DB_FILE = _DATA_DIR / "audit_sessions.db"
_lock = threading.Lock()


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_consent_table() -> None:
    """Create the consent_records table if it doesn't exist."""
    with sqlite3.connect(_DB_FILE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS consent_records (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                phone_hash TEXT,
                consent_type TEXT NOT NULL,
                consent_given INTEGER NOT NULL,
                consent_timestamp TEXT NOT NULL,
                consent_text_version TEXT DEFAULT 'v1.0',
                ip_address TEXT,
                user_agent TEXT
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_consent_session ON consent_records(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_consent_type ON consent_records(consent_type)"
        )


def store_consent(record: ConsentRecord) -> str:
    """Persist a consent record. Returns the record ID."""
    _ensure_dir()
    with _lock:
        _ensure_consent_table()
        with sqlite3.connect(_DB_FILE) as conn:
            conn.execute(
                """
                INSERT INTO consent_records (
                    id, session_id, phone_hash, consent_type, consent_given,
                    consent_timestamp, consent_text_version, ip_address, user_agent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    consent_given = excluded.consent_given,
                    consent_timestamp = excluded.consent_timestamp,
                    ip_address = excluded.ip_address,
                    user_agent = excluded.user_agent
                """,
                (
                    record.id,
                    record.session_id,
                    record.phone_hash,
                    record.consent_type.value,
                    1 if record.consent_given else 0,
                    record.consent_timestamp,
                    record.consent_text_version,
                    record.ip_address,
                    record.user_agent,
                ),
            )
    return record.id


def get_consent_by_session(session_id: str) -> list[dict]:
    """Retrieve all consent records for a session."""
    _ensure_dir()
    with _lock:
        _ensure_consent_table()
        with sqlite3.connect(_DB_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                "SELECT * FROM consent_records WHERE session_id = ? ORDER BY consent_timestamp",
                (session_id,),
            )
            rows = cur.fetchall()
    return [dict(row) for row in rows]
