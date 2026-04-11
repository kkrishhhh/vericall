"""VeriCall Fraud Detection — multi-signal fraud flag engine."""

from models import CustomerData, FaceAnalysisResponse, FraudFlag


def assess_risk(
    customer: CustomerData,
    face_analysis: FaceAnalysisResponse | None = None,
    location: dict | None = None,
) -> dict:
    """
    Assess fraud risk based on all available signals.

    Returns:
        dict with keys: risk_band (str), fraud_flags (list), eligible (bool), reason (str)
    """
    flags: list[FraudFlag] = []

    # ── 1. Age Mismatch Check ─────────────────────────────────
    if face_analysis and face_analysis.face_detected and customer.declared_age > 0:
        age_diff = abs(face_analysis.estimated_age - customer.declared_age)
        if age_diff > 8:
            flags.append(FraudFlag(
                flag="AGE_MISMATCH",
                severity="high",
                details=f"Declared age {customer.declared_age}, estimated {face_analysis.estimated_age:.0f} (diff: {age_diff:.0f} yrs)",
            ))
        elif age_diff > 5:
            flags.append(FraudFlag(
                flag="AGE_MINOR_DISCREPANCY",
                severity="low",
                details=f"Declared age {customer.declared_age}, estimated {face_analysis.estimated_age:.0f} (diff: {age_diff:.0f} yrs)",
            ))

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

    # ── 4. Consent Check ──────────────────────────────────────
    if not customer.consent:
        flags.append(FraudFlag(
            flag="NO_CONSENT",
            severity="high",
            details="Customer has not provided explicit verbal consent",
        ))

    # ── 5. Age Eligibility ────────────────────────────────────
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

    return {
        "risk_band": risk_band,
        "fraud_flags": [f.model_dump() for f in flags],
        "eligible": eligible,
        "reason": reason,
    }
