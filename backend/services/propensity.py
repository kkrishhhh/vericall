"""Simple, transparent propensity scoring used for demo explainability."""

from __future__ import annotations

from models import CustomerData


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def compute_propensity(
    customer: CustomerData,
    risk_band: str,
    risk_score: int,
    bureau: dict | None = None,
) -> dict:
    """
    Return a transparent propensity score (0..1) with factor contributions.
    Higher means more likely successful repayment/conversion.
    """
    bureau = bureau or {}
    factors: list[dict] = []

    score = 0.55

    income_norm = 0.0
    if customer.income > 0:
        income_norm = _clip((customer.income - 15000) / 85000, 0.0, 1.0)
    income_contrib = 0.22 * income_norm
    score += income_contrib
    factors.append({"factor": "income", "contribution": round(income_contrib, 4)})

    bureau_score = float(bureau.get("bureau_score", 650))
    bureau_norm = _clip((bureau_score - 300) / 600, 0.0, 1.0)
    bureau_contrib = 0.18 * bureau_norm
    score += bureau_contrib
    factors.append({"factor": "bureau_score", "contribution": round(bureau_contrib, 4)})

    if 25 <= customer.declared_age <= 45:
        age_contrib = 0.06
    elif customer.declared_age > 0:
        age_contrib = -0.03
    else:
        age_contrib = -0.01
    score += age_contrib
    factors.append({"factor": "age_stability", "contribution": round(age_contrib, 4)})

    band = (risk_band or "MEDIUM").upper()
    band_contrib = {"LOW": 0.08, "MEDIUM": -0.04, "HIGH": -0.15}.get(band, -0.04)
    score += band_contrib
    factors.append({"factor": "risk_band", "contribution": round(band_contrib, 4)})

    risk_contrib = -0.14 * _clip(risk_score / 100.0, 0.0, 1.0)
    score += risk_contrib
    factors.append({"factor": "risk_score", "contribution": round(risk_contrib, 4)})

    consent_contrib = 0.08 if customer.consent else -0.22
    score += consent_contrib
    factors.append({"factor": "consent", "contribution": round(consent_contrib, 4)})

    final = round(_clip(score, 0.01, 0.99), 3)
    if final >= 0.72:
        propensity_band = "HIGH"
    elif final >= 0.48:
        propensity_band = "MEDIUM"
    else:
        propensity_band = "LOW"

    return {
        "model": "propensity_formula_v1",
        "score": final,
        "band": propensity_band,
        "factors": factors,
    }
