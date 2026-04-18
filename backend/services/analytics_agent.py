"""Conversational Analytics Agent — Natural Language → SQL → Answer.

Takes a natural language question from a PFL officer, uses Groq LLM
to generate a safe SQLite query against audit_sessions, executes it,
and returns a natural language answer plus the raw data.

Security:
- Only SELECT statements allowed
- DDL/DML blocked (CREATE, DROP, INSERT, UPDATE, DELETE, ALTER, etc.)
- Parameterized queries only — no raw f-strings in SQL
- Table access restricted to audit_sessions and human_review_queue
"""

import json
import os
import re
import sqlite3
import threading
from pathlib import Path

from groq import Groq

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DB_FILE = _DATA_DIR / "audit_sessions.db"
_lock = threading.Lock()

_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# ── Schema for the LLM prompt ───────────────────────────────────

_AUDIT_SCHEMA = """
TABLE: audit_sessions
Columns:
  - id: INTEGER PRIMARY KEY AUTOINCREMENT
  - session_id: TEXT UNIQUE NOT NULL  (UUID)
  - logged_at: TEXT NOT NULL  (ISO 8601 datetime, e.g., '2026-04-15T12:00:00+00:00')
  - phone: TEXT  (SHA-256 hash of phone number — NOT raw phone)
  - room_url: TEXT  (Daily.co room URL)
  - campaign_id: TEXT
  - campaign_link: TEXT
  - loan_type: TEXT  (personal_loan, home_loan, etc.)
  - risk_band: TEXT  (HIGH, MEDIUM, LOW)
  - risk_score: INTEGER  (0-100)
  - offer_status: TEXT  (PRE-APPROVED, NEEDS_REVIEW, DECLINED)
  - payload_json: TEXT  (Full JSON blob with all session data)

TABLE: human_review_queue
Columns:
  - id: TEXT PRIMARY KEY
  - session_id: TEXT NOT NULL
  - customer_name: TEXT
  - escalation_reason: TEXT
  - escalation_trigger: TEXT  (comma-separated trigger IDs)
  - priority: TEXT  (HIGH, MEDIUM, LOW)
  - status: TEXT  (PENDING, IN_REVIEW, RESOLVED, OVERRIDDEN)
  - assigned_officer: TEXT
  - ai_decision: TEXT
  - human_decision: TEXT
  - resolution_notes: TEXT
  - created_at: TEXT  (ISO 8601 datetime)
  - resolved_at: TEXT  (ISO 8601 datetime or NULL)

TABLE: consent_records
Columns:
  - id: TEXT PRIMARY KEY
  - session_id: TEXT NOT NULL
  - phone_hash: TEXT
  - consent_type: TEXT  (VIDEO_RECORDING, DATA_PROCESSING, KYC_VERIFICATION)
  - consent_given: INTEGER  (0 or 1)
  - consent_timestamp: TEXT
  - consent_text_version: TEXT
  - ip_address: TEXT
  - user_agent: TEXT

IMPORTANT NOTES FOR QUERY GENERATION:
- Dates are stored as ISO 8601 strings. Use datetime() for comparisons.
- To get recent data: WHERE logged_at >= datetime('now', '-7 days')
- risk_band values: 'HIGH', 'MEDIUM', 'LOW'
- offer_status values: 'PRE-APPROVED', 'NEEDS_REVIEW', 'DECLINED'
- payload_json contains the full session data as a JSON string.
  Use json_extract(payload_json, '$.key') to access nested fields.
  Common paths: '$.extracted.name', '$.extracted.income', '$.risk.fraud_flags',
  '$.offer.approved_amount', '$.offer.interest_rate'
"""

_SYSTEM_PROMPT = f"""You are VANTAGE Assistant — a friendly, conversational AI helper for PFL (Poonawalla Fincorp Limited) staff inside the Vantage AI admin dashboard.

You have TWO modes:

MODE 1 — GENERAL QUESTIONS (about the platform, onboarding, how things work, etc.)
If the user asks a general question that does NOT need database data, respond conversationally and helpfully. Explain how Vantage AI works, what the panels do, what KYC means, etc. Be friendly, concise, and use plain language. Do NOT generate SQL for these.
For general questions, start your response with "GENERAL:" followed by your answer.

MODE 2 — DATA QUESTIONS (stats, counts, trends, specific session lookups, etc.)
If the user asks something that requires querying the database, generate a SQLite SELECT query.
For data questions, start your response with "SQL:" followed by ONLY the raw SQL query.

You have access to these SQLite tables:
{_AUDIT_SCHEMA}

Rules for SQL generation:
1. Only SELECT statements. No DDL or DML.
2. Always limit results to 100 rows max.
3. Use proper datetime functions for date comparisons.
4. Return ONLY "SQL:" followed by the raw query. No markdown, no code blocks.

Examples:
- "how does the site work?" → GENERAL: Vantage AI is an AI-powered Video KYC platform...
- "how many KYCs today?" → SQL: SELECT COUNT(*) as count FROM audit_sessions WHERE logged_at >= datetime('now', '-1 day')
- "what's my role here?" → GENERAL: As a PFL officer, you can review applications...
- "show rejected applications" → SQL: SELECT * FROM audit_sessions WHERE offer_status = 'DECLINED' ORDER BY logged_at DESC LIMIT 20"""



# ── SQL Sanitization ─────────────────────────────────────────────

_BLOCKED_KEYWORDS = [
    "CREATE", "DROP", "INSERT", "UPDATE", "DELETE", "ALTER",
    "TRUNCATE", "REPLACE", "GRANT", "REVOKE", "EXEC", "EXECUTE",
    "ATTACH", "DETACH", "PRAGMA", "VACUUM", "REINDEX",
]

_ALLOWED_TABLES = {"audit_sessions", "human_review_queue", "consent_records"}


def _sanitize_sql(sql: str) -> str:
    """Validate and sanitize SQL. Raises ValueError if unsafe."""
    cleaned = sql.strip()

    # Remove markdown code blocks if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    # Remove trailing semicolons
    cleaned = cleaned.rstrip(";").strip()

    # Must start with SELECT
    if not cleaned.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed")

    # Check for blocked keywords
    upper = cleaned.upper()
    for keyword in _BLOCKED_KEYWORDS:
        # Use word boundary check to avoid false positives
        pattern = r'\b' + keyword + r'\b'
        if re.search(pattern, upper):
            raise ValueError(f"Blocked SQL keyword: {keyword}")

    # Ensure LIMIT exists
    if "LIMIT" not in upper:
        cleaned += " LIMIT 100"

    return cleaned


# ── Main Query Function ─────────────────────────────────────────

def ask_analytics(question: str) -> dict:
    """Process a natural language question — either general or data-driven.

    1. Sends question to Groq LLM which decides: GENERAL answer or SQL query
    2. If GENERAL: returns the conversational answer directly
    3. If SQL: sanitizes, executes, and summarizes the results

    Args:
        question: Natural language question from PFL officer.

    Returns:
        Dict with: answer (str), sql (str), raw_data (list), row_count (int)
    """
    # Step 1: Ask LLM to decide mode and respond
    try:
        response = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        llm_output = response.choices[0].message.content.strip()
    except Exception as e:
        return {
            "answer": f"Couldn't reach the AI — {str(e)}",
            "sql": "",
            "raw_data": [],
            "row_count": 0,
            "error": True,
        }

    # Step 1b: Check if this is a GENERAL (non-SQL) response
    if llm_output.upper().startswith("GENERAL:"):
        answer_text = llm_output[len("GENERAL:"):].strip()
        return {
            "answer": answer_text,
            "sql": "",
            "raw_data": [],
            "row_count": 0,
            "error": False,
        }

    # Extract SQL (strip "SQL:" prefix if present)
    raw_sql = llm_output
    if raw_sql.upper().startswith("SQL:"):
        raw_sql = raw_sql[4:].strip()

    # Step 2: Sanitize SQL
    try:
        safe_sql = _sanitize_sql(raw_sql)
    except ValueError as e:
        return {
            "answer": f"Generated query was blocked for safety: {str(e)}",
            "sql": raw_sql,
            "raw_data": [],
            "row_count": 0,
            "error": True,
        }

    # Step 3: Execute query
    try:
        with _lock:
            with sqlite3.connect(_DB_FILE) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(safe_sql)
                rows = [dict(row) for row in cur.fetchall()]
    except sqlite3.Error as e:
        return {
            "answer": f"SQL execution error: {str(e)}",
            "sql": safe_sql,
            "raw_data": [],
            "row_count": 0,
            "error": True,
        }

    # Step 4: Summarize results with LLM
    # Truncate data for LLM context window
    data_preview = json.dumps(rows[:20], indent=2, default=str)
    if len(data_preview) > 3000:
        data_preview = data_preview[:3000] + "\n... (truncated)"

    try:
        summary_response = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are VANTAGE Assistant — a friendly, helpful colleague for PFL staff. "
                        "Summarize the database results in a natural, conversational tone. "
                        "Be specific with numbers but keep it casual and easy to read. "
                        "Use short sentences. If there's no data, just say 'Looks like there's nothing here yet!' "
                        "Don't be overly formal — imagine you're chatting with a coworker."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Question: {question}\n\n"
                        f"SQL used: {safe_sql}\n\n"
                        f"Results ({len(rows)} rows):\n{data_preview}"
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=500,
        )
        answer = summary_response.choices[0].message.content.strip()
    except Exception:
        # Fallback: just show raw counts
        answer = f"Query returned {len(rows)} rows. (LLM summary unavailable)"

    return {
        "answer": answer,
        "sql": safe_sql,
        "raw_data": rows[:50],  # Cap at 50 for response size
        "row_count": len(rows),
        "error": False,
    }
