"""InterviewAgent — Pre-approval, consent validation, income consistency.

Tool Registry:
    1. calculate_preapproval(income, employment_type)
    2. validate_consent(text)
    3. detect_income_inconsistency(income, employment_type, age)

Design notes:
- Reuses compute_preapproval logic from services/journey_core.py.
- validate_consent does NLP keyword matching for affirmative consent
  (RBI V-CIP mandate: explicit verbal consent MUST be captured).
- detect_income_inconsistency ports the fraud.py income checks into
  a standalone tool the orchestrator can invoke independently.
"""

from __future__ import annotations

import re
from typing import Any

from agents.state import AgentState


# ── Tool 1: calculate_preapproval ────────────────────────────────

def calculate_preapproval(income: float, employment_type: str) -> dict[str, Any]:
    """Compute pre-approval eligibility range based on income and employment.

    Uses NBFC-standard income multipliers:
        salaried:       10x–15x monthly income
        self-employed:  6x–10x monthly income
        professional:   8x–12x monthly income

    Returns dict with eligible_min, eligible_max, eligible_amount.
    """
    emp = (employment_type or "").strip().lower()

    # Bucket the employment type (same logic as journey_core._employment_bucket)
    if "self" in emp or "business" in emp:
        bucket = "self-employed"
        mult_min, mult_max = 6, 10
    elif "professional" in emp or "doctor" in emp or "lawyer" in emp or "ca" in emp:
        bucket = "professional"
        mult_min, mult_max = 8, 12
    else:
        bucket = "salaried"
        mult_min, mult_max = 10, 15

    eligible_min = round(income * mult_min, 0)
    eligible_max = round(income * mult_max, 0)

    return {
        "employment_bucket": bucket,
        "eligible_min": eligible_min,
        "eligible_max": eligible_max,
        "eligible_amount": eligible_max,  # Optimistic pre-approval
        "income_used": income,
    }


# ── Tool 2: validate_consent ────────────────────────────────────

# Affirmative consent keywords in English, Hindi, Marathi
_CONSENT_YES = re.compile(
    r"\b(yes|haan|ha|haa|ho|agree|consent|accept|okay|ok|sure|of\s*course"
    r"|manzoor|razamand|sammat|mala\s*manya)\b",
    re.IGNORECASE,
)
_CONSENT_NO = re.compile(
    r"\b(no|nahi|nako|disagree|decline|refuse|reject|deny|nah)\b",
    re.IGNORECASE,
)


def validate_consent(text: str) -> dict[str, Any]:
    """Determine whether the customer's response constitutes explicit consent.

    RBI V-CIP requires recorded verbal consent before proceeding.
    We check for affirmative keywords across English, Hindi, and Marathi.

    Returns:
        consent_given (bool), confidence (float), raw_text (str)
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return {
            "consent_given": False,
            "confidence": 0.0,
            "raw_text": "",
            "reason": "Empty consent response",
        }

    yes_matches = _CONSENT_YES.findall(cleaned)
    no_matches = _CONSENT_NO.findall(cleaned)

    # If both yes and no tokens present, the last one wins (recency bias)
    if yes_matches and no_matches:
        # Find last occurrence positions
        last_yes = max(m.start() for m in _CONSENT_YES.finditer(cleaned))
        last_no = max(m.start() for m in _CONSENT_NO.finditer(cleaned))
        consent = last_yes > last_no
        confidence = 0.6  # Ambiguous response
    elif yes_matches:
        consent = True
        confidence = 0.95
    elif no_matches:
        consent = False
        confidence = 0.95
    else:
        # No clear yes/no — treat as non-consent for safety
        consent = False
        confidence = 0.3

    return {
        "consent_given": consent,
        "confidence": confidence,
        "raw_text": cleaned,
        "reason": "Affirmative consent detected" if consent else "Consent not detected or declined",
    }


# ── Tool 3: detect_income_inconsistency ─────────────────────────

def detect_income_inconsistency(
    income: float,
    employment_type: str,
    age: int,
) -> dict[str, Any]:
    """Flag income-vs-employment mismatches that indicate potential fraud.

    Rules (ported from fraud.py + additional age-based checks):
        - Student claiming > ₹50,000/month → medium severity
        - Unemployed claiming > ₹20,000/month → high severity
        - Age < 21 with income > ₹100,000/month → medium (unusual)
        - Self-employed age < 22 with income > ₹200,000 → medium
    """
    flags: list[dict[str, Any]] = []
    emp = (employment_type or "").strip().lower()

    if "student" in emp and income > 50000:
        flags.append({
            "flag": "INCOME_INCONSISTENCY",
            "severity": "medium",
            "details": f"Student claiming ₹{income:,.0f}/month income",
        })

    if "unemployed" in emp and income > 20000:
        flags.append({
            "flag": "INCOME_INCONSISTENCY",
            "severity": "high",
            "details": f"Unemployed claiming ₹{income:,.0f}/month income",
        })

    if age > 0 and age < 21 and income > 100000:
        flags.append({
            "flag": "AGE_INCOME_MISMATCH",
            "severity": "medium",
            "details": f"Age {age} with ₹{income:,.0f}/month — unusual for age group",
        })

    if "self" in emp and age > 0 and age < 22 and income > 200000:
        flags.append({
            "flag": "AGE_INCOME_MISMATCH",
            "severity": "medium",
            "details": f"Self-employed age {age} claiming ₹{income:,.0f}/month",
        })

    return {
        "consistent": len(flags) == 0,
        "flags": flags,
        "checked": {
            "income": income,
            "employment_type": employment_type,
            "age": age,
        },
    }


# ── Agent Runner ─────────────────────────────────────────────────

async def run_interview_agent(state: AgentState, payload: dict[str, Any]) -> AgentState:
    """Execute the InterviewAgent phase.

    Expected payload keys:
        name, employment_type, monthly_income, loan_type,
        requested_loan_amount, declared_age, consent_text
    """
    # Step 1: Populate customer profile from payload
    profile = state.customer_profile
    profile.name = payload.get("name", profile.name)
    profile.employment_type = payload.get("employment_type", profile.employment_type)
    profile.monthly_income = float(payload.get("monthly_income", profile.monthly_income))
    profile.loan_type = payload.get("loan_type", profile.loan_type)
    profile.requested_loan_amount = float(payload.get("requested_loan_amount", profile.requested_loan_amount))
    profile.declared_age = int(payload.get("declared_age", profile.declared_age))
    profile.consent_text = payload.get("consent_text", profile.consent_text)
    profile.interview_notes = payload.get("interview_notes", profile.interview_notes)

    # Step 2: Calculate pre-approval
    try:
        preapproval = calculate_preapproval(
            income=profile.monthly_income,
            employment_type=profile.employment_type,
        )
        profile.eligible_amount = preapproval["eligible_amount"]
        state.log_audit(
            agent="InterviewAgent",
            action="calculate_preapproval",
            result=f"Eligible up to ₹{preapproval['eligible_amount']:,.0f} ({preapproval['employment_bucket']})",
            regulatory_tag="RBI_KYC_2016_CH5",
        )
    except Exception as e:
        state.log_error("InterviewAgent", "TOOL_FAILURE", f"calculate_preapproval failed: {e}")
        state.log_audit(
            agent="InterviewAgent",
            action="calculate_preapproval",
            result="",
            success=False,
            error=str(e),
        )

    # Step 3: Validate consent (V-CIP mandatory)
    try:
        consent_result = validate_consent(profile.consent_text)
        profile.consent = consent_result["consent_given"]
        state.consent_recorded = consent_result["consent_given"]
        state.log_audit(
            agent="InterviewAgent",
            action="validate_consent",
            result=f"Consent={'YES' if consent_result['consent_given'] else 'NO'} "
                   f"(confidence={consent_result['confidence']:.2f})",
            regulatory_tag="VCIP_CONSENT",
            metadata=consent_result,
        )
    except Exception as e:
        state.log_error("InterviewAgent", "TOOL_FAILURE", f"validate_consent failed: {e}")
        state.log_audit(
            agent="InterviewAgent",
            action="validate_consent",
            result="",
            success=False,
            error=str(e),
        )

    # Step 4: Detect income inconsistency
    try:
        income_check = detect_income_inconsistency(
            income=profile.monthly_income,
            employment_type=profile.employment_type,
            age=profile.declared_age,
        )
        state.log_audit(
            agent="InterviewAgent",
            action="detect_income_inconsistency",
            result=f"Consistent={income_check['consistent']}, flags={len(income_check['flags'])}",
            regulatory_tag="RBI_KYC_2016_CH4",
            metadata=income_check,
        )
        # Store any fraud flags for downstream use
        if not income_check["consistent"]:
            state.risk_assessment.fraud_flags.extend(income_check["flags"])
    except Exception as e:
        state.log_error("InterviewAgent", "TOOL_FAILURE", f"detect_income_inconsistency failed: {e}")
        state.log_audit(
            agent="InterviewAgent",
            action="detect_income_inconsistency",
            result="",
            success=False,
            error=str(e),
        )

    return state
