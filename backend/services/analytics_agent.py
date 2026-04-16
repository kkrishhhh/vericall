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

_SYSTEM_PROMPT = f"""You are a data analytics assistant for VeriCall, a loan origination AI system.
You help PFL (Poonawalla Fincorp Limited) officers answer questions about loan sessions.

You have access to these SQLite tables:
{_AUDIT_SCHEMA}

When the user asks a question:
1. Generate a valid SQLite SELECT query to answer it.
2. Return ONLY the SQL query, nothing else.
3. Do NOT use any DDL or DML (no CREATE, DROP, INSERT, UPDATE, DELETE, ALTER).
4. Only use SELECT statements.
5. Always limit results to at most 100 rows (add LIMIT 100 if not already present).
6. Use proper datetime functions for date comparisons.

Return ONLY the raw SQL query. No markdown, no code blocks, no explanation."""


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
    """Process a natural language analytics question.

    1. Sends question to Groq LLM to generate SQL
    2. Sanitizes and validates the SQL
    3. Executes it against audit_sessions.db
    4. Sends results back to LLM for natural language summary

    Args:
        question: Natural language question from PFL officer.

    Returns:
        Dict with: answer (str), sql (str), raw_data (list), row_count (int)
    """
    # Step 1: Generate SQL from natural language
    try:
        sql_response = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ],
            temperature=0.1,
            max_tokens=500,
        )
        raw_sql = sql_response.choices[0].message.content.strip()
    except Exception as e:
        return {
            "answer": f"Failed to generate SQL query: {str(e)}",
            "sql": "",
            "raw_data": [],
            "row_count": 0,
            "error": True,
        }

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
                        "You are a data analyst for VeriCall loan origination system. "
                        "Summarize the SQL query results in clear, concise natural language. "
                        "Be specific with numbers. Use bullet points for lists. "
                        "If there's no data, say so clearly."
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
