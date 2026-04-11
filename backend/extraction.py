"""Second-pass LLM extraction: messy transcript → structured customer profile."""

import json
import os
import re

from groq import Groq
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_MODEL = "llama-3.3-70b-versatile"


def _client() -> Groq:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not configured")
    return Groq(api_key=key)

_EXTRACTION_PROMPT = """You normalize loan onboarding data from a messy transcript (speech-to-text errors, Hindi-English mix, fillers).

Extract ONLY what the customer clearly stated. If unknown, use empty string, 0, or false.

Return a single JSON object with EXACTLY these keys (no markdown):
{
  "name": "full name or empty",
  "age": integer or 0,
  "income": number monthly INR or 0,
  "employment": "salaried|self-employed|student|unemployed|other" (lowercase, best match),
  "loan_purpose": "short phrase or empty",
  "consent": true only if they clearly agree to proceed / credit check / application,
  "extraction_confidence": 0.0-1.0 how sure you are,
  "notes": "brief fraud or inconsistency hints, or empty"
}

Rules:
- Income: map "lakh" (1 lakh = 100000 INR/month if they say per month; if annual, divide by 12).
- Ignore the AI agent's questions; only customer statements count.
- If age and employment contradict (e.g. "school student" with age 40), lower extraction_confidence and mention in notes.
"""


def extract_profile_from_text(conversation_text: str) -> dict:
    text = conversation_text.strip()[:12000]
    kwargs = dict(
        model=_MODEL,
        messages=[
            {"role": "system", "content": _EXTRACTION_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.2,
        max_tokens=512,
    )
    try:
        response = _client().chat.completions.create(
            **kwargs,
            response_format={"type": "json_object"},
        )
    except Exception:
        response = _client().chat.completions.create(**kwargs)
    raw = (response.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise ValueError("Model did not return valid JSON") from None
        data = json.loads(m.group())

    return {
        "name": str(data.get("name", "") or ""),
        "age": int(data.get("age") or 0),
        "income": float(data.get("income") or 0),
        "employment": str(data.get("employment", "") or ""),
        "loan_purpose": str(data.get("loan_purpose", "") or ""),
        "consent": bool(data.get("consent", False)),
        "extraction_confidence": max(0.0, min(1.0, float(data.get("extraction_confidence", 0.5)))),
        "notes": str(data.get("notes", "") or ""),
    }
