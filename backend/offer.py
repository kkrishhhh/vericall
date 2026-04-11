"""VeriCall Offer Engine — policy-based loan offer generation."""

import math
from models import CustomerData, FraudFlag


def generate_offer(
    customer: CustomerData,
    risk_band: str = "MEDIUM",
    fraud_flags: list[dict] | None = None,
) -> dict:
    """
    Generate a personalized loan offer based on customer data and risk assessment.

    Returns:
        dict with loan offer details including status, amount, rate, EMI, etc.
    """
    fraud_flags = fraud_flags or []
    high_flags = sum(1 for f in fraud_flags if f.get("severity") == "high")

    # ── Determine Status ──────────────────────────────────────
    if high_flags >= 2 or not customer.consent:
        status = "DECLINED"
    elif high_flags == 1 or risk_band == "HIGH":
        status = "NEEDS_REVIEW"
    elif risk_band == "MEDIUM":
        status = "PRE-APPROVED"
    else:
        status = "PRE-APPROVED"

    if customer.income < 15000:
        status = "DECLINED"

    if status == "DECLINED":
        return _declined_offer(customer, fraud_flags)

    # ── Calculate Loan Parameters ─────────────────────────────
    # Income multiplier based on employment type
    emp_lower = customer.employment.lower() if customer.employment else ""
    if "salaried" in emp_lower:
        income_multiplier = 15
        base_rate = 11.5
    elif "self-employed" in emp_lower or "business" in emp_lower:
        income_multiplier = 10
        base_rate = 13.0
    else:
        income_multiplier = 7
        base_rate = 14.5

    # Risk-adjusted parameters
    if risk_band == "HIGH":
        income_multiplier *= 0.5
        base_rate += 3.0
    elif risk_band == "MEDIUM":
        income_multiplier *= 0.8
        base_rate += 1.0

    # Calculate loan amount (round to nearest 10,000)
    raw_amount = customer.income * income_multiplier
    loan_amount = max(50000, math.floor(raw_amount / 10000) * 10000)
    loan_amount = min(loan_amount, 1000000)  # Cap at 10L

    # Determine tenure
    if loan_amount <= 100000:
        tenure_months = 12
    elif loan_amount <= 300000:
        tenure_months = 24
    else:
        tenure_months = 36

    # Interest rate
    interest_rate = round(base_rate, 1)

    # EMI calculation: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    monthly_rate = interest_rate / 12 / 100
    if monthly_rate > 0:
        emi = loan_amount * monthly_rate * math.pow(1 + monthly_rate, tenure_months)
        emi = emi / (math.pow(1 + monthly_rate, tenure_months) - 1)
        monthly_emi = round(emi, 0)
    else:
        monthly_emi = round(loan_amount / tenure_months, 0)

    # Processing fee (1% of loan amount, min ₹1000)
    processing_fee = max(1000, round(loan_amount * 0.01, 0))

    # Confidence score
    confidence_score = _calculate_confidence(customer, fraud_flags, risk_band)

    # Build verification summary
    verification = _build_verification_summary(customer, fraud_flags)

    # Reason codes
    reason_codes = []
    if status == "NEEDS_REVIEW":
        reason_codes = [f.get("flag", "UNKNOWN") for f in fraud_flags if f.get("severity") in ("high", "medium")]

    return {
        "status": status,
        "loan_amount": loan_amount,
        "tenure_months": tenure_months,
        "interest_rate": interest_rate,
        "monthly_emi": monthly_emi,
        "processing_fee": processing_fee,
        "confidence_score": confidence_score,
        "reason_codes": reason_codes,
        "verification_summary": verification,
    }


def _declined_offer(customer: CustomerData, fraud_flags: list[dict]) -> dict:
    """Generate a declined offer response."""
    reasons = [f.get("flag", "UNKNOWN") for f in fraud_flags if f.get("severity") == "high"]
    if customer.income < 15000:
        reasons.append("INCOME_BELOW_MINIMUM")
    if not customer.consent:
        reasons.append("NO_CONSENT")

    return {
        "status": "DECLINED",
        "loan_amount": 0,
        "tenure_months": 0,
        "interest_rate": 0,
        "monthly_emi": 0,
        "processing_fee": 0,
        "confidence_score": 0,
        "reason_codes": reasons,
        "verification_summary": _build_verification_summary(customer, fraud_flags),
    }


def _calculate_confidence(
    customer: CustomerData, fraud_flags: list[dict], risk_band: str
) -> float:
    """Calculate overall confidence score (0.0 - 1.0)."""
    score = 1.0

    # Deduct for fraud flags
    for flag in fraud_flags:
        if flag.get("severity") == "high":
            score -= 0.2
        elif flag.get("severity") == "medium":
            score -= 0.1
        else:
            score -= 0.05

    # Bonus for face detection + age claim alignment (CV)
    if customer.age_confidence and customer.age_confidence > 0.8:
        score += 0.05
    if customer.age_match_score is not None and customer.age_match_score >= 0.75:
        score += 0.04

    # Risk band adjustment
    if risk_band == "HIGH":
        score -= 0.15
    elif risk_band == "MEDIUM":
        score -= 0.05

    return round(max(0.0, min(1.0, score)), 2)


def _build_verification_summary(customer: CustomerData, fraud_flags: list[dict]) -> dict:
    """Build the verification summary for the offer card."""
    flag_names = {f.get("flag") for f in fraud_flags}

    age_verified = customer.estimated_age is not None and "AGE_MISMATCH" not in flag_names
    location_verified = "LOCATION_OUTSIDE_INDIA" not in flag_names
    income_verified = "INCOME_INCONSISTENCY" not in flag_names and customer.income > 0
    consent_captured = customer.consent

    return {
        "age_verified": age_verified,
        "age_estimate": customer.estimated_age,
        "age_confidence": customer.age_confidence,
        "age_match_score": customer.age_match_score,
        "location_verified": location_verified,
        "income_declared": customer.income,
        "income_verified": income_verified,
        "employment": customer.employment,
        "consent_captured": consent_captured,
        "fraud_flags_count": len(fraud_flags),
        "no_fraud_flags": len(fraud_flags) == 0,
    }
