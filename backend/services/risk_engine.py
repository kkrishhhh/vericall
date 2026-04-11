"""Rule-based risk scoring and human-readable decision reasons."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import CustomerData, FraudFlag


def _flag_weight(severity: str) -> int:
    s = (severity or "medium").lower()
    if s == "high":
        return 28
    if s == "low":
        return 6
    return 14


def compute_risk_score(
    risk_band: str,
    fraud_flags: list,
    customer: "CustomerData | None" = None,
) -> int:
    """
    Numeric risk score 0–100 (higher = riskier).
    Anchored on band, then adjusted by flag severities.
    """
    band = (risk_band or "MEDIUM").upper()
    base = {"LOW": 22, "MEDIUM": 48, "HIGH": 72}.get(band, 48)

    penalty = 0
    for f in fraud_flags:
        sev = f.severity if hasattr(f, "severity") else f.get("severity", "medium")
        penalty += _flag_weight(sev)

    if customer is not None:
        if customer.declared_age and (customer.declared_age < 21 or customer.declared_age > 55):
            penalty += 8
        if customer.income > 0 and customer.income < 15000:
            penalty += 18

    return int(min(100, max(0, base + penalty // 2)))


def build_decision_reasons(
    risk_band: str,
    fraud_flags: list,
    eligible: bool,
    eligibility_reason: str,
) -> list[str]:
    """Short strings suitable for UI and audit logs."""
    reasons: list[str] = []
    reasons.append(f"Risk band: {risk_band}")

    for f in fraud_flags:
        if hasattr(f, "model_dump"):
            d = f.model_dump()
        else:
            d = dict(f)
        flag = d.get("flag", "UNKNOWN")
        details = d.get("details", "")
        reasons.append(f"{flag}: {details}".strip())

    if not eligible and eligibility_reason:
        reasons.append(f"Eligibility: {eligibility_reason}")
    elif eligible:
        reasons.append("Eligibility: passed automated checks")

    return reasons
