"""VeriCall AI Agent — Groq LLM conversation engine."""

import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

SYSTEM_PROMPT = """You are VeriCall, an AI loan origination agent for Poonawalla Fincorp.
Your job is to collect the following information from the customer in a friendly, conversational way:
1. Full name  2. Age  3. Monthly income (in INR)  4. Employment type (salaried/self-employed/student)
5. Loan purpose  6. Explicit verbal consent to proceed

Rules:
- Ask one question at a time. Be warm and professional.
- If income sounds inconsistent with employment (e.g., student claiming 1L/mo), ask a gentle follow-up.
- When all data is collected and consent received, respond with only this JSON:
{"done": true, "name": "", "age": 0, "income": 0, "employment": "", "purpose": "", "consent": true, "risk_notes": ""}
- Never reveal that you are AI-powered or mention specific APIs.
- Start by greeting the customer warmly and asking for their full name.
- Always respond in English. Keep responses concise (2-3 sentences max).
- Fill in the actual values the customer provided in the JSON output."""

MODEL = "llama-3.3-70b-versatile"


def run_agent(transcript: str, conversation_history: list[dict]) -> dict:
    """
    Run the Groq LLM agent with the latest transcript and conversation history.

    Returns:
        dict with keys: message (str), done (bool), data (dict|None)
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add conversation history
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add the latest customer transcript
    if transcript.strip():
        messages.append({"role": "user", "content": transcript})

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=512,
    )

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
