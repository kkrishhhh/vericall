"""Human Review Queue — Escalation system for high-risk loan decisions.

When the AI system detects conditions that require human oversight,
cases are automatically escalated to a review queue. PFL officers
can then review, override, or approve the AI's decision.

Escalation Triggers:
- risk_band is HIGH
- fraud_flags >= 2
- deepfake_risk is HIGH
- loan_amount > ₹10,00,000
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


# ── Enums ────────────────────────────────────────────────────────

class ReviewPriority(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ReviewStatus(str, Enum):
    PENDING = "PENDING"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"
    OVERRIDDEN = "OVERRIDDEN"


# ── Escalation Triggers ─────────────────────────────────────────

ESCALATION_TRIGGERS = [
    {
        "id": "HIGH_RISK_BAND",
        "condition": "risk_band == 'HIGH'",
        "description": "Customer's overall risk band is HIGH",
        "priority": ReviewPriority.HIGH,
    },
    {
        "id": "MULTIPLE_FRAUD_FLAGS",
        "condition": "fraud_flags >= 2",
        "description": "Two or more fraud flags detected",
        "priority": ReviewPriority.HIGH,
    },
    {
        "id": "DEEPFAKE_RISK",
        "condition": "deepfake_risk == 'HIGH'",
        "description": "High suspected deepfake or AI-generated document risk",
        "priority": ReviewPriority.HIGH,
    },
    {
        "id": "HIGH_LOAN_AMOUNT",
        "condition": "loan_amount > 1000000",
        "description": "Loan amount exceeds ₹10,00,000 threshold",
        "priority": ReviewPriority.MEDIUM,
    },
    {
        "id": "AGE_MISMATCH",
        "condition": "age_mismatch_severity == 'HIGH'",
        "description": "Significant discrepancy between declared and estimated age",
        "priority": ReviewPriority.MEDIUM,
    },
    {
        "id": "DOCUMENT_FORENSICS_FAIL",
        "condition": "forensics_score < 0.3",
        "description": "Document forensics score critically low — suspected fake",
        "priority": ReviewPriority.HIGH,
    },
    {
        "id": "SELFIE_MISMATCH",
        "condition": "selfie_match_score < 0.4",
        "description": "Live selfie does not match document photo",
        "priority": ReviewPriority.HIGH,
    },
]


# ── Models ───────────────────────────────────────────────────────

class HumanReviewItem(BaseModel):
    """A single human review queue entry."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    customer_name: str = ""
    escalation_reason: str = ""
    escalation_trigger: str = ""                # ID from ESCALATION_TRIGGERS
    priority: ReviewPriority = ReviewPriority.MEDIUM
    status: ReviewStatus = ReviewStatus.PENDING
    assigned_officer: Optional[str] = None
    ai_decision: str = ""                       # The AI's original decision
    human_decision: Optional[str] = None        # Officer's override decision
    resolution_notes: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    resolved_at: Optional[str] = None


class EscalateRequest(BaseModel):
    """Request body for POST /api/review/escalate."""
    session_id: str
    customer_name: str = ""
    escalation_reason: str = ""
    escalation_trigger: str = ""
    priority: ReviewPriority = ReviewPriority.MEDIUM
    ai_decision: str = ""


class ResolveRequest(BaseModel):
    """Request body for POST /api/review/{session_id}/resolve."""
    human_decision: str
    resolution_notes: str = ""
    assigned_officer: str = ""


# ── Storage ──────────────────────────────────────────────────────

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DB_FILE = _DATA_DIR / "audit_sessions.db"
_lock = threading.Lock()


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_review_table() -> None:
    """Create the human_review_queue table if it doesn't exist."""
    with sqlite3.connect(_DB_FILE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS human_review_queue (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                customer_name TEXT,
                escalation_reason TEXT,
                escalation_trigger TEXT,
                priority TEXT DEFAULT 'MEDIUM',
                status TEXT DEFAULT 'PENDING',
                assigned_officer TEXT,
                ai_decision TEXT,
                human_decision TEXT,
                resolution_notes TEXT,
                created_at TEXT NOT NULL,
                resolved_at TEXT
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_review_session ON human_review_queue(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_review_status ON human_review_queue(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_review_priority ON human_review_queue(priority)"
        )


def escalate_to_review(item: HumanReviewItem) -> str:
    """Add a case to the human review queue. Returns the review item ID."""
    _ensure_dir()
    with _lock:
        _ensure_review_table()
        with sqlite3.connect(_DB_FILE) as conn:
            conn.execute(
                """
                INSERT INTO human_review_queue (
                    id, session_id, customer_name, escalation_reason,
                    escalation_trigger, priority, status, assigned_officer,
                    ai_decision, human_decision, resolution_notes,
                    created_at, resolved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    escalation_reason = excluded.escalation_reason,
                    priority = excluded.priority,
                    status = excluded.status
                """,
                (
                    item.id,
                    item.session_id,
                    item.customer_name,
                    item.escalation_reason,
                    item.escalation_trigger,
                    item.priority.value,
                    item.status.value,
                    item.assigned_officer,
                    item.ai_decision,
                    item.human_decision,
                    item.resolution_notes,
                    item.created_at,
                    item.resolved_at,
                ),
            )
    return item.id


def get_review_queue(
    status: str | None = None,
    priority: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Retrieve review queue items, optionally filtered."""
    _ensure_dir()
    with _lock:
        _ensure_review_table()
        query = "SELECT * FROM human_review_queue"
        params: list = []
        conditions = []

        if status:
            conditions.append("status = ?")
            params.append(status)
        if priority:
            conditions.append("priority = ?")
            params.append(priority)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, created_at DESC"
        query += " LIMIT ?"
        params.append(limit)

        with sqlite3.connect(_DB_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(query, params)
            rows = cur.fetchall()

    return [dict(row) for row in rows]


def resolve_review(session_id: str, human_decision: str, resolution_notes: str = "", officer: str = "") -> bool:
    """Resolve a review queue item. Returns True if an item was updated."""
    _ensure_dir()
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        _ensure_review_table()
        with sqlite3.connect(_DB_FILE) as conn:
            cur = conn.execute(
                """
                UPDATE human_review_queue
                SET status = ?,
                    human_decision = ?,
                    resolution_notes = ?,
                    assigned_officer = ?,
                    resolved_at = ?
                WHERE session_id = ? AND status IN ('PENDING', 'IN_REVIEW')
                """,
                (
                    ReviewStatus.RESOLVED.value,
                    human_decision,
                    resolution_notes,
                    officer,
                    now,
                    session_id,
                ),
            )
            return cur.rowcount > 0


def check_and_escalate(session_data: dict) -> list[str]:
    """Automatically check escalation triggers against session data.

    Called after decision evaluation. Returns list of trigger IDs that fired.

    Args:
        session_data: The full session payload containing risk, offer, etc.

    Returns:
        List of escalation trigger IDs that were activated.
    """
    risk = session_data.get("risk") or {}
    offer = session_data.get("offer") or {}
    extracted = session_data.get("extracted") or {}
    fraud_flags = risk.get("fraud_flags") or []

    fired_triggers = []

    # Check each trigger
    risk_band = risk.get("risk_band", "")
    num_fraud_flags = len(fraud_flags) if isinstance(fraud_flags, list) else 0
    loan_amount = float(offer.get("approved_amount") or extracted.get("requested_amount") or 0)
    forensics = session_data.get("document_forensics") or {}
    forensics_score = forensics.get("forensics_score", 1.0)
    selfie_score = session_data.get("selfie_match_score") or 1.0

    if risk_band == "HIGH":
        fired_triggers.append("HIGH_RISK_BAND")
    if num_fraud_flags >= 2:
        fired_triggers.append("MULTIPLE_FRAUD_FLAGS")
    if loan_amount > 1_000_000:
        fired_triggers.append("HIGH_LOAN_AMOUNT")
    if forensics_score < 0.3:
        fired_triggers.append("DOCUMENT_FORENSICS_FAIL")
    if isinstance(selfie_score, (int, float)) and selfie_score < 0.4:
        fired_triggers.append("SELFIE_MISMATCH")

    # If any triggers fired, escalate
    if fired_triggers:
        # Determine highest priority
        priority = ReviewPriority.LOW
        for trigger_id in fired_triggers:
            for t in ESCALATION_TRIGGERS:
                if t["id"] == trigger_id and t["priority"].value == "HIGH":
                    priority = ReviewPriority.HIGH
                    break
            if priority == ReviewPriority.HIGH:
                break
        if priority != ReviewPriority.HIGH:
            priority = ReviewPriority.MEDIUM

        item = HumanReviewItem(
            session_id=session_data.get("session_id", ""),
            customer_name=extracted.get("name", ""),
            escalation_reason=f"Auto-escalated: {', '.join(fired_triggers)}",
            escalation_trigger=",".join(fired_triggers),
            priority=priority,
            ai_decision=offer.get("status", "UNKNOWN"),
        )
        escalate_to_review(item)

    return fired_triggers
