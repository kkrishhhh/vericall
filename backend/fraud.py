"""Vantage AI Fraud Detection — multi-signal fraud flag engine."""

from models import CustomerData, FaceAnalysisResponse, FraudFlag
from services.risk_engine import build_decision_reasons, compute_risk_score
from services.bureau import get_bureau_snapshot
from services.propensity import compute_propensity
from age_verification import fraud_flags_for_visual_age


def assess_risk(
    customer: CustomerData,
    face_analysis: FaceAnalysisResponse | None = None,
    location: dict | None = None,
    bureau: dict | None = None,
) -> dict:
    """
    Assess fraud risk based on all available signals.

    Returns:
        dict with keys: risk_band (str), fraud_flags (list), eligible (bool), reason (str)
    """
    flags: list[FraudFlag] = []

    # ── 1. Visual age vs claimed age (CV / DeepFace) ──────────
    if face_analysis and face_analysis.face_detected and customer.declared_age > 0:
        flags.extend(
            fraud_flags_for_visual_age(
                face_analysis.estimated_age,
                customer.declared_age,
                face_detected=True,
            )
        )

    # ── 2. Location Validation ────────────────────────────────
    if location:
        lat = location.get("latitude", 0)
        lon = location.get("longitude", 0)

        # Basic India bounding box check
        if lat and lon:
            in_india = (6.0 <= lat <= 37.0) and (68.0 <= lon <= 98.0)
            if not in_india:
                flags.append(FraudFlag(
                    flag="LOCATION_OUTSIDE_INDIA",
                    severity="high",
                    details=f"GPS coordinates ({lat:.2f}, {lon:.2f}) are outside India",
                ))

    # ── 3. Income-Employment Consistency ──────────────────────
    if customer.income > 0 and customer.employment:
        emp_lower = customer.employment.lower()
        if "student" in emp_lower and customer.income > 50000:
            flags.append(FraudFlag(
                flag="INCOME_INCONSISTENCY",
                severity="medium",
                details=f"Student claiming ₹{customer.income:,.0f}/month income",
            ))
        if "unemployed" in emp_lower and customer.income > 20000:
            flags.append(FraudFlag(
                flag="INCOME_INCONSISTENCY",
                severity="high",
                details=f"Unemployed claiming ₹{customer.income:,.0f}/month income",
            ))

    # ── 4. Missing / incomplete onboarding data ────────────────
    missing: list[str] = []
    if not (customer.name or "").strip():
        missing.append("name")
    if not customer.declared_age or customer.declared_age <= 0:
        missing.append("age")
    if not customer.income or customer.income <= 0:
        missing.append("income")
    if not (customer.employment or "").strip():
        missing.append("employment")
    if not (customer.purpose or "").strip():
        missing.append("loan_purpose")
    if missing:
        flags.append(FraudFlag(
            flag="MISSING_CRITICAL_DATA",
            severity="high" if len(missing) >= 2 else "medium",
            details=f"Incomplete application fields: {', '.join(missing)}",
        ))

    # ── 5. Consent Check ──────────────────────────────────────
    if not customer.consent:
        flags.append(FraudFlag(
            flag="NO_CONSENT",
            severity="high",
            details="Customer has not provided explicit verbal consent",
        ))

    # ── 6. Age Eligibility ────────────────────────────────────
    if customer.declared_age > 0:
        if customer.declared_age < 21 or customer.declared_age > 55:
            flags.append(FraudFlag(
                flag="AGE_INELIGIBLE",
                severity="medium",
                details=f"Age {customer.declared_age} is outside eligible range (21-55)",
            ))

    # ── Calculate Risk Band ───────────────────────────────────
    high_flags = sum(1 for f in flags if f.severity == "high")
    medium_flags = sum(1 for f in flags if f.severity == "medium")

    if high_flags >= 2:
        risk_band = "HIGH"
    elif high_flags == 1 or medium_flags >= 2:
        risk_band = "MEDIUM"
    else:
        risk_band = "LOW"

    # Eligibility check
    eligible = high_flags == 0 and customer.income >= 15000
    reason = ""
    if not eligible:
        reasons = []
        if high_flags > 0:
            reasons.append("High-severity fraud flags detected")
        if customer.income < 15000:
            reasons.append(f"Income ₹{customer.income:,.0f} below minimum threshold")
        reason = "; ".join(reasons)

    risk_score = compute_risk_score(risk_band, flags, customer)
    decision_reasons = build_decision_reasons(risk_band, flags, eligible, reason)
    bureau_snapshot = bureau or get_bureau_snapshot(customer)
    propensity = compute_propensity(customer, risk_band, risk_score, bureau_snapshot)

    reason_codes = [f.flag for f in flags]
    explainability = {
        "reason_codes": reason_codes,
        "top_factors": [
            {"factor": "risk_band", "value": risk_band},
            {"factor": "risk_score", "value": risk_score},
            {
                "factor": "bureau_score",
                "value": bureau_snapshot.get("bureau_score"),
            },
            {
                "factor": "propensity_score",
                "value": propensity.get("score"),
            },
        ],
        "decision_trace": decision_reasons,
    }

    return {
        "risk_band": risk_band,
        "risk_score": risk_score,
        "fraud_flags": [f.model_dump() for f in flags],
        "eligible": eligible,
        "reason": reason,
        "decision_reasons": decision_reasons,
        "bureau": bureau_snapshot,
        "propensity": propensity,
        "explainability": explainability,
    }
