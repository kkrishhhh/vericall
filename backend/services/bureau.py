"""Mock bureau adapter used until a real bureau integration is wired."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from models import CustomerData


def _stable_bucket(text: str, mod: int) -> int:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % mod


def get_bureau_snapshot(customer: CustomerData) -> dict:
    """Return deterministic fake bureau data for demos and scoring experiments."""
    key = f"{customer.name}|{customer.declared_age}|{customer.income}|{customer.employment}|{customer.purpose}"

    income_component = 0
    if customer.income > 0:
        income_component = min(180, int((customer.income / 100000) * 120))

    age_component = 0
    if 25 <= customer.declared_age <= 45:
        age_component = 45
    elif customer.declared_age > 0:
        age_component = 20

    variance = _stable_bucket(key, 81) - 40
    score = max(300, min(900, 520 + income_component + age_component + variance))

    active_loans = _stable_bucket(key + "active", 4)
    inquiries_6m = _stable_bucket(key + "inq", 5)
    delinquencies_12m = 0 if score >= 680 else _stable_bucket(key + "dq", 3)
    utilization_pct = 18 + _stable_bucket(key + "util", 63)

    if score >= 760:
        band = "EXCELLENT"
    elif score >= 700:
        band = "GOOD"
    elif score >= 620:
        band = "FAIR"
    else:
        band = "THIN_OR_RISKY"

    recommendation = "favorable" if score >= 680 and delinquencies_12m == 0 else "cautious"

    return {
        "provider": "mock_bureau_v1",
        "bureau_score": score,
        "score_band": band,
        "active_loans": active_loans,
        "inquiries_6m": inquiries_6m,
        "delinquencies_12m": delinquencies_12m,
        "credit_utilization_pct": utilization_pct,
        "recommendation": recommendation,
        "pulled_at": datetime.now(timezone.utc).isoformat(),
    }
