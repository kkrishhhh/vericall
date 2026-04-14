"""VeriCall AI Agent — Groq LLM conversation engine."""

import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

_LANGUAGE_INSTRUCTIONS = {
    "en": "Always respond in English.",
    "hi": "Always respond in Hindi (हिंदी). Use Devanagari script for Hindi.",
    "mr": "Always respond in Marathi (मराठी). Use Devanagari script for Marathi.",
}


def _build_system_prompt(language: str = "en") -> str:
    lang_instruction = _LANGUAGE_INSTRUCTIONS.get(language, _LANGUAGE_INSTRUCTIONS["en"])
    return f"""You are VeriCall, an AI loan origination agent for Poonawalla Fincorp.
Your job is to collect the following information from the customer in a friendly, conversational way:
1. Full name
2. Employment type (salaried/self-employed/professional)
3. Monthly income (in INR)
4. Loan type (personal/business/loan against property/other)
5. Requested loan amount (INR)
6. Declared age (optional; collect if naturally provided)

Rules:
- Ask one question at a time. Be warm and professional.
- Use only these values for employment_type: salaried, self-employed, professional.
- When ALL required fields are clearly collected, your ENTIRE reply must be ONLY valid JSON (no prose, no markdown) in this exact shape:
{{"done": true, "name": "", "employment_type": "", "monthly_income": 0, "loan_type": "", "requested_loan_amount": 0, "declared_age": 0, "interview_notes": ""}}
- Use numbers for monthly_income and requested_loan_amount.
- Keep declared_age as 0 if unknown.
- Never reveal that you are AI-powered or mention specific APIs.
- Start by greeting the customer warmly and asking for their full name.
- {lang_instruction} Keep conversational turns concise (2-3 sentences max) until the final JSON-only message.
- Fill in the actual values the customer provided in the JSON output."""


MODEL = "llama-3.3-70b-versatile"


def run_agent(transcript: str, conversation_history: list[dict], language: str = "en") -> dict:
    """
    Run the Groq LLM agent with the latest transcript and conversation history.

    Returns:
        dict with keys: message (str), done (bool), data (dict|None)
    """
    messages = [{"role": "system", "content": _build_system_prompt(language)}]

    # Add conversation history
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add the latest customer transcript
    if transcript.strip():
        messages.append({"role": "user", "content": transcript})

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=320,
        )
    except Exception as e:
        msg = str(e)
        if "rate_limit_exceeded" in msg or "Rate limit reached" in msg:
            raise RuntimeError(f"AGENT_RATE_LIMIT: {msg}") from e
        raise

    reply = response.choices[0].message.content.strip()

    # Check if the agent returned the final JSON
    done = False
    data = None

    try:
        # Try to parse the entire response as JSON
        parsed = json.loads(reply)
        if isinstance(parsed, dict) and parsed.get("done") is True:
            done = True
            data = parsed
            # Create a friendly closing message
            reply = f"Thank you, {parsed.get('name', 'Customer')}! I have all the information I need. Let me process your application now."
    except json.JSONDecodeError:
        # Check if JSON is embedded within the response
        if '{"done": true' in reply or '{"done":true' in reply:
            try:
                json_start = reply.index("{")
                json_end = reply.rindex("}") + 1
                json_str = reply[json_start:json_end]
                parsed = json.loads(json_str)
                if parsed.get("done") is True:
                    done = True
                    data = parsed
                    reply = f"Thank you, {parsed.get('name', 'Customer')}! I have all the information I need. Let me process your application now."
            except (ValueError, json.JSONDecodeError):
                pass

    return {
        "message": reply,
        "done": done,
        "data": data,
    }
