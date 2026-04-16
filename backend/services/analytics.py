"""Admin Analytics — SQL-based reporting over audit_sessions.

Provides overview stats, fraud breakdowns, regional approval rates,
and AI performance metrics for PFL officers and managers.
"""

import json
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DB_FILE = _DATA_DIR / "audit_sessions.db"
_lock = threading.Lock()


def _query(sql: str, params: tuple = ()) -> list[dict]:
    """Execute a read-only query and return list of dicts."""
    try:
        with _lock:
            with sqlite3.connect(_DB_FILE) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(sql, params)
                return [dict(row) for row in cur.fetchall()]
    except sqlite3.OperationalError:
        # Table may not exist yet (no sessions logged)
        return []


def _days_ago(days: int) -> str:
    """Return ISO timestamp for N days ago."""
    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.isoformat()


def get_overview_stats(days: int = 7) -> dict:
    """Overview: total sessions, approval/rejection rates, avg duration."""
    cutoff = _days_ago(days)

    rows = _query(
        "SELECT payload_json FROM audit_sessions WHERE logged_at >= ?",
        (cutoff,),
    )

    total = len(rows)
    if total == 0:
        return {
            "period_days": days,
            "total_sessions": 0,
            "approval_rate": 0.0,
            "rejection_rate": 0.0,
            "hold_rate": 0.0,
            "avg_session_duration_seconds": 0,
        }

    approved = 0
    rejected = 0
    hold = 0
    durations = []

    for r in rows:
        try:
            data = json.loads(r["payload_json"])
        except (json.JSONDecodeError, KeyError):
            continue

        offer = data.get("offer") or {}
        status = (offer.get("status") or "").upper()
        if status in ("APPROVED", "PRE-APPROVED", "PRE_APPROVED"):
            approved += 1
        elif status in ("REJECTED", "DECLINED"):
            rejected += 1
        elif status == "HOLD":
            hold += 1

        # Duration estimate from timestamps if available
        dur = data.get("session_duration_seconds")
        if isinstance(dur, (int, float)):
            durations.append(dur)

    return {
        "period_days": days,
        "total_sessions": total,
        "approval_rate": round(approved / total * 100, 1) if total else 0.0,
        "rejection_rate": round(rejected / total * 100, 1) if total else 0.0,
        "hold_rate": round(hold / total * 100, 1) if total else 0.0,
        "approved": approved,
        "rejected": rejected,
        "hold": hold,
        "avg_session_duration_seconds": round(sum(durations) / len(durations)) if durations else 0,
    }


def get_fraud_stats(days: int = 30) -> dict:
    """Breakdown of fraud flag types and counts."""
    cutoff = _days_ago(days)

    rows = _query(
        "SELECT payload_json FROM audit_sessions WHERE logged_at >= ?",
        (cutoff,),
    )

    flag_counts: dict[str, int] = {}
    total_flagged = 0

    for r in rows:
        try:
            data = json.loads(r["payload_json"])
        except (json.JSONDecodeError, KeyError):
            continue

        risk = data.get("risk") or {}
        flags = risk.get("fraud_flags") or []
        if not isinstance(flags, list):
            continue

        if flags:
            total_flagged += 1

        for flag in flags:
            if isinstance(flag, dict):
                flag_type = flag.get("flag") or flag.get("type") or "UNKNOWN"
            else:
                flag_type = str(flag)
            flag_counts[flag_type] = flag_counts.get(flag_type, 0) + 1

    return {
        "period_days": days,
        "total_sessions": len(rows),
        "sessions_with_fraud_flags": total_flagged,
        "fraud_flag_breakdown": flag_counts,
    }


def get_regional_breakdown(days: int = 30) -> dict:
    """Approval rates grouped by detected city from geolocation."""
    cutoff = _days_ago(days)

    rows = _query(
        "SELECT payload_json FROM audit_sessions WHERE logged_at >= ?",
        (cutoff,),
    )

    city_stats: dict[str, dict] = {}

    for r in rows:
        try:
            data = json.loads(r["payload_json"])
        except (json.JSONDecodeError, KeyError):
            continue

        # Try to find city from various locations in the payload
        extracted = data.get("extracted") or {}
        geo = extracted.get("geo") or {}
        city = geo.get("geo_city") or extracted.get("city") or data.get("geo_city") or "Unknown"
        city = city.strip().title() if city else "Unknown"

        offer = data.get("offer") or {}
        status = (offer.get("status") or "").upper()

        if city not in city_stats:
            city_stats[city] = {"total": 0, "approved": 0, "rejected": 0}

        city_stats[city]["total"] += 1
        if status in ("APPROVED", "PRE-APPROVED", "PRE_APPROVED"):
            city_stats[city]["approved"] += 1
        elif status in ("REJECTED", "DECLINED"):
            city_stats[city]["rejected"] += 1

    # Compute approval rates
    regional = []
    for city, stats in sorted(city_stats.items(), key=lambda x: x[1]["total"], reverse=True):
        t = stats["total"]
        regional.append({
            "city": city,
            "total_sessions": t,
            "approved": stats["approved"],
            "rejected": stats["rejected"],
            "approval_rate": round(stats["approved"] / t * 100, 1) if t else 0.0,
        })

    return {
        "period_days": days,
        "total_cities": len(regional),
        "regional": regional,
    }


def get_ai_performance_metrics(days: int = 7) -> dict:
    """AI performance: escalations, question counts, repeated questions."""
    cutoff = _days_ago(days)

    rows = _query(
        "SELECT payload_json FROM audit_sessions WHERE logged_at >= ?",
        (cutoff,),
    )

    total = len(rows)
    escalated = 0
    question_counts = []
    repeated_question_sessions = 0

    for r in rows:
        try:
            data = json.loads(r["payload_json"])
        except (json.JSONDecodeError, KeyError):
            continue

        # Check if escalated to human review
        risk = data.get("risk") or {}
        if risk.get("risk_band") == "HIGH":
            escalated += 1

        # Count agent questions from transcript
        transcript = data.get("transcript") or ""
        if isinstance(transcript, str):
            questions = transcript.count("?")
            question_counts.append(questions)

            # Detect repeated questions (simple heuristic)
            lines = [l.strip().lower() for l in transcript.split("\n") if "?" in l]
            if len(lines) != len(set(lines)):
                repeated_question_sessions += 1

    return {
        "period_days": days,
        "total_sessions": total,
        "sessions_escalated_to_human": escalated,
        "avg_questions_per_session": round(sum(question_counts) / len(question_counts), 1) if question_counts else 0,
        "sessions_with_repeated_questions": repeated_question_sessions,
        "escalation_rate": round(escalated / total * 100, 1) if total else 0.0,
    }
