"""Vantage AI Agent — Groq LLM conversation engine (Fixed Loop Issue)."""

import os
import json
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

_LANGUAGE_INSTRUCTIONS = {
    "en": "Always respond in English only. Do not mix Hindi or Marathi words in English mode.",
    "hi": "Always respond in Hindi (हिंदी) only. Use Devanagari script for Hindi and do not mix English unless it is a proper noun.",
    "mr": "Always respond in Marathi (मराठी) only. Use Devanagari script for Marathi and do not mix English unless it is a proper noun.",
}

_CONSENT_QUESTIONS = {
    "en": "Do you provide explicit consent for this video session to be recorded and securely stored? Please answer Yes or No.",
    "hi": "क्या आप इस वीडियो सत्र को रिकॉर्ड करके सुरक्षित रूप से संग्रहीत करने के लिए स्पष्ट सहमति देते हैं? कृपया हाँ या नहीं में उत्तर दें।",
    "mr": "आपण या व्हिडिओ सत्राचे रेकॉर्डिंग करून सुरक्षितरीत्या साठवण्यासाठी स्पष्ट संमती देता का? कृपया होय किंवा नाही असे उत्तर द्या.",
}

_CLOSING_MESSAGES = {
    "en": {
        "no_consent": "Thank you, {name}. Since consent was not provided, we will not be able to proceed with the application as per RBI guidelines.",
        "done": "Thank you, {name}! I have all the information I need. Let me process your application now.",
    },
    "hi": {
        "no_consent": "धन्यवाद, {name}। सहमति प्राप्त नहीं होने के कारण RBI दिशा-निर्देशों के अनुसार हम आवेदन आगे नहीं बढ़ा सकते।",
        "done": "धन्यवाद, {name}! मुझे सभी आवश्यक जानकारी मिल गई है। अब मैं आपका आवेदन प्रोसेस कर रहा हूँ।",
    },
    "mr": {
        "no_consent": "धन्यवाद, {name}. संमती मिळाली नसल्यामुळे RBI मार्गदर्शक तत्त्वांनुसार आम्ही अर्ज पुढे नेऊ शकत नाही.",
        "done": "धन्यवाद, {name}! मला सर्व आवश्यक माहिती मिळाली आहे. आता मी तुमचा अर्ज प्रक्रिया करत आहे.",
    },
}


def _build_system_prompt(language: str = "en") -> str:
    """
    Crystal clear system prompt that prevents loops by explicitly tracking state.
    """
    lang_instruction = _LANGUAGE_INSTRUCTIONS.get(language, _LANGUAGE_INSTRUCTIONS["en"])
    consent_question = _CONSENT_QUESTIONS.get(language, _CONSENT_QUESTIONS["en"])
    return f"""You are Vantage AI, a professional loan agent. Follow this EXACT sequence, asking each question ONLY ONCE:

QUESTION SEQUENCE (never ask a question twice):
Q1: Ask for full name (if not provided)
Q2: Ask naturally about the customer's occupation/work type. Do NOT show slash-separated options in the spoken reply. If they say "employed", classify as "salaried".
Q3: Ask for monthly income in INR - extract ONLY the number (e.g., "1 lakh" = 100000, "50k" = 50000)
Q4: Ask naturally which kind of loan they need. Do NOT show slash-separated options in the spoken reply.
Q5: Ask for loan amount in INR - extract ONLY the number
Q6: Ask for age - extract ONLY the number
Q7: Ask for video consent using this exact sentence in the selected language: "{consent_question}"

CRITICAL RULES:
- After Q6 (age), you MUST ask Q7 (consent). Do not skip or repeat previous questions.
- NEVER ask the same question twice. Once you have answered a field, NEVER ask it again.
- Track in your mind: which of the 7 questions have I asked?
- If user gives unclear answers (e.g., "employed" for employment), interpret generously and move forward.
- Keep tone natural and conversational. Avoid robotic labels like "employment type" unless user asks for clarification.
- Never include bracketed or slash-joined option lists in customer-facing text (e.g., "a/b/c" or "(x/y/z)").
- When user answers Q7 (consent), output ONLY the JSON below with no other text:

{{"done": true, "name": "STRING", "employment_type": "salaried|self-employed|professional", "monthly_income": NUMBER, "loan_type": "STRING", "requested_loan_amount": NUMBER, "declared_age": NUMBER, "consent": true|false, "interview_notes": ""}}

EXAMPLES:
- User says "1 lakh" for income → monthly_income: 100000
- User says "3 lakh" for loan → requested_loan_amount: 300000
- User says "employed" for employment → employment_type: "salaried"
- User says "personal" for loan → loan_type: "personal"

Remember: You are professional but friendly. Keep responses concise (1-2 sentences). Never mix languages in one sentence. {lang_instruction}
"""


# Prefer higher-consistency model for multilingual conversational quality.
MODEL = "llama-3.3-70b-versatile"


def run_agent(transcript: str, conversation_history: list[dict], language: str = "en") -> dict:
    """
    Run the Groq LLM agent WITHOUT trimming history.
    Keep ALL conversation history so AI remembers what was already collected.
    
    Returns:
        dict with keys: message (str), done (bool), data (dict|None)
    """
    language = language if language in _LANGUAGE_INSTRUCTIONS else "en"
    messages = [{"role": "system", "content": _build_system_prompt(language)}]

    # IMPORTANT: Keep full conversation history (don't trim)
    # This prevents the loop issue where AI forgets what was already asked
    for msg in conversation_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add the latest customer transcript
    if transcript.strip():
        messages.append({"role": "user", "content": transcript})

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.3,
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
            # Create a friendly closing message based on consent
            loc = _CLOSING_MESSAGES.get(language, _CLOSING_MESSAGES["en"])
            person = parsed.get("name", "Customer")
            if parsed.get("consent") is False:
                reply = loc["no_consent"].format(name=person)
            else:
                reply = loc["done"].format(name=person)
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
                    loc = _CLOSING_MESSAGES.get(language, _CLOSING_MESSAGES["en"])
                    person = parsed.get("name", "Customer")
                    if parsed.get("consent") is False:
                        reply = loc["no_consent"].format(name=person)
                    else:
                        reply = loc["done"].format(name=person)
            except (ValueError, json.JSONDecodeError):
                pass

    return {
        "message": reply,
        "done": done,
        "data": data,
    }
