"""Age claim vs face-estimate — scoring and fraud flags (shared by vision + risk)."""

from __future__ import annotations

from models import FraudFlag


def assess_age_against_claim(
    estimated_age: float,
    declared_age: int,
    *,
    face_detected: bool,
) -> dict:
    """
    Compare DeepFace (or similar) age to customer-declared age.

    Returns keys for API / UI: age_delta_years, age_match_score, looks_consistent_with_claim,
    verification_message.
    """
    if not face_detected or declared_age <= 0:
        return {
            "age_delta_years": None,
            "age_match_score": 0.0,
            "looks_consistent_with_claim": None,
            "verification_message": "No face detected for age verification."
            if not face_detected
            else "Declared age missing — skipped visual age check.",
        }

    delta = abs(float(estimated_age) - float(declared_age))

    if delta <= 5:
        score = 1.0
        consistent = True
        tier = "strong match"
    elif delta <= 8:
        score = 0.78
        consistent = True
        tier = "acceptable match"
    elif delta <= 12:
        score = 0.45
        consistent = True
        tier = "within tolerance"
    else:
        score = max(0.05, 1.0 - min(1.0, (delta - 12) / 15))
        consistent = False
        tier = "poor match"

    msg = (
        f"Visual estimate ~{estimated_age:.0f} yrs vs claimed {declared_age} "
        f"(Δ {delta:.1f} yrs — {tier})."
    )

    return {
        "age_delta_years": round(delta, 2),
        "age_match_score": round(score, 2),
        "looks_consistent_with_claim": consistent,
        "verification_message": msg,
    }


def fraud_flags_for_visual_age(
    estimated_age: float,
    declared_age: int,
    *,
    face_detected: bool,
) -> list[FraudFlag]:
    """Visual age vs claim — same flag names as legacy risk (offer card / dashboards)."""
    if not face_detected or declared_age <= 0:
        return []

    delta = abs(float(estimated_age) - float(declared_age))

    if delta > 12:
        return [
            FraudFlag(
                flag="AGE_MISMATCH",
                severity="high",
                details=(
                    f"Face estimate ~{estimated_age:.0f} yrs vs declared {declared_age} "
                    f"(Δ {delta:.0f} yrs) — does not look like stated age."
                ),
            )
        ]
    if delta > 8:
        return [
            FraudFlag(
                flag="AGE_MINOR_DISCREPANCY",
                severity="low",
                details=(
                    f"Declared {declared_age}, face estimate ~{estimated_age:.0f} "
                    f"(Δ {delta:.0f} yrs)."
                ),
            )
        ]
    return []
