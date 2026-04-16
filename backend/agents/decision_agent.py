"""DecisionAgent — Bureau scoring, propensity, offer generation, RAG policy.

Tool Registry:
    1. bureau_score(income, age)
    2. propensity_score(bureau, risk_band, income)
    3. generate_offer(eligible_amount, rate, tenure_options)
    4. query_rbi_policy_rag(decision_reason)

Design notes:
- bureau_score and propensity_score reuse existing logic from
  services/bureau.py and services/propensity.py respectively.
- generate_offer computes the final loan offer using policy-based rules
  (ported from offer.py).
- query_rbi_policy_rag delegates to PolicyRAGAgent to retrieve
  the most relevant RBI regulatory justification for any decision.
- Every decision is paired with a RAG citation in the audit trail.
"""

from __future__ import annotations

import math
import hashlib
from datetime import datetime, timezone
from typing import Any

from agents.state import AgentState


# ── Tool 1: bureau_score ─────────────────────────────────────────

def bureau_score(income: float, age: int) -> dict[str, Any]:
    """Simulate a bureau credit score based on income and age.

    Reuses the deterministic scoring logic from services/bureau.py.
    In production, this would call CIBIL/Experian/Equifax/CRIF APIs.

    Score range: 300–900 (same as CIBIL Trans Union scale)
    """
    # Income component (higher income → higher score contribution)
    income_component = 0
    if income > 0:
        income_component = min(180, int((income / 100000) * 120))

    # Age stability component (25–45 is prime lending range)
    age_component = 0
    if 25 <= age <= 45:
        age_component = 45
    elif age > 0:
        age_component = 20

    # Deterministic variance based on inputs
    key = f"{income}|{age}"
    variance = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 81 - 40
    score = max(300, min(900, 520 + income_component + age_component + variance))

    # Derive band
    if score >= 760:
        band = "EXCELLENT"
    elif score >= 700:
        band = "GOOD"
    elif score >= 620:
        band = "FAIR"
    else:
        band = "THIN_OR_RISKY"

    # Additional mock bureau fields
    active_loans = int(hashlib.sha256(f"{key}active".encode()).hexdigest()[:8], 16) % 4
    delinquencies = 0 if score >= 680 else int(hashlib.sha256(f"{key}dq".encode()).hexdigest()[:8], 16) % 3

    return {
        "bureau_score": score,
        "score_band": band,
        "active_loans": active_loans,
        "delinquencies_12m": delinquencies,
        "recommendation": "favorable" if score >= 680 and delinquencies == 0 else "cautious",
        "provider": "mock_bureau_v1",
        "pulled_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Tool 2: propensity_score ────────────────────────────────────

def propensity_score(
    bureau: dict[str, Any],
    risk_band: str,
    income: float,
) -> dict[str, Any]:
    """Compute repayment/conversion propensity score.

    Reuses the transparent factor-based model from services/propensity.py.
    Score range: 0.01–0.99 (higher = more likely to repay/convert).
    """
    def _clip(v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    factors: list[dict] = []
    score = 0.55

    # Income factor
    income_norm = _clip((income - 15000) / 85000, 0.0, 1.0) if income > 0 else 0.0
    income_contrib = 0.22 * income_norm
    score += income_contrib
    factors.append({"factor": "income", "contribution": round(income_contrib, 4)})

    # Bureau score factor
    bscore = float(bureau.get("bureau_score", 650))
    bureau_norm = _clip((bscore - 300) / 600, 0.0, 1.0)
    bureau_contrib = 0.18 * bureau_norm
    score += bureau_contrib
    factors.append({"factor": "bureau_score", "contribution": round(bureau_contrib, 4)})

    # Risk band factor
    band = (risk_band or "MEDIUM").upper()
    band_contrib = {"LOW": 0.08, "MEDIUM": -0.04, "HIGH": -0.15}.get(band, -0.04)
    score += band_contrib
    factors.append({"factor": "risk_band", "contribution": round(band_contrib, 4)})

    final = round(_clip(score, 0.01, 0.99), 3)
    if final >= 0.72:
        prop_band = "HIGH"
    elif final >= 0.48:
        prop_band = "MEDIUM"
    else:
        prop_band = "LOW"

    return {
        "score": final,
        "band": prop_band,
        "factors": factors,
        "model": "propensity_formula_v1",
    }


# ── Tool 3: generate_offer ──────────────────────────────────────

def generate_offer(
    eligible_amount: float,
    rate: float,
    tenure_options: list[int],
) -> dict[str, Any]:
    """Generate a final loan offer with EMI computation.

    Uses standard reducing-balance EMI formula:
        EMI = P * r * (1+r)^n / ((1+r)^n - 1)

    Where P = principal, r = monthly rate, n = tenure in months.
    """
    if eligible_amount <= 0:
        return {
            "status": "DECLINED",
            "approved_amount": 0,
            "interest_rate": 0,
            "tenure_months": 0,
            "monthly_emi": 0,
            "processing_fee": 0,
        }

    # Pick optimal tenure
    if eligible_amount <= 100000:
        tenure = 12
    elif eligible_amount <= 300000:
        tenure = 24
    else:
        tenure = 36

    # Ensure tenure is in offered options
    if tenure not in tenure_options and tenure_options:
        tenure = tenure_options[0]

    # EMI calculation
    monthly_rate = rate / 12 / 100
    if monthly_rate > 0 and tenure > 0:
        emi = eligible_amount * monthly_rate * math.pow(1 + monthly_rate, tenure)
        emi = emi / (math.pow(1 + monthly_rate, tenure) - 1)
        monthly_emi = round(emi, 0)
    else:
        monthly_emi = round(eligible_amount / max(tenure, 1), 0)

    # Processing fee (1% of loan amount, min ₹1000)
    processing_fee = max(1000, round(eligible_amount * 0.01, 0))

    return {
        "status": "PRE-APPROVED",
        "approved_amount": eligible_amount,
        "interest_rate": rate,
        "tenure_months": tenure,
        "tenure_options": tenure_options,
        "monthly_emi": monthly_emi,
        "processing_fee": processing_fee,
    }


# ── Tool 4: query_rbi_policy_rag ────────────────────────────────

async def query_rbi_policy_rag(decision_reason: str) -> dict[str, Any]:
    """Query the PolicyRAGAgent for RBI regulatory justification.

    Delegates to rag_agent.PolicyRAGAgent to find the most relevant
    clauses from RBI KYC Master Direction 2016 for the given decision.
    """
    try:
        from agents.rag_agent import PolicyRAGAgent
        rag = PolicyRAGAgent.get_instance()
        results = rag.query(decision_reason, top_k=3)
        return {
            "query": decision_reason,
            "citations": results,
            "source": "RBI KYC Master Direction 2016",
        }
    except Exception as e:
        return {
            "query": decision_reason,
            "citations": [],
            "error": str(e),
            "source": "RBI KYC Master Direction 2016",
        }


# ── Agent Runner ─────────────────────────────────────────────────

async def run_decision_agent(state: AgentState, payload: dict[str, Any]) -> AgentState:
    """Execute the DecisionAgent phase.

    Runs bureau scoring, propensity modeling, offer generation, and
    queries the RAG for regulatory justification of every decision.
    """
    profile = state.customer_profile
    kyc = state.kyc_status
    doc = state.document_results
    risk = state.risk_assessment
    offer = state.offer

    # Gate check: KYC must be verified
    if kyc.status != "VERIFIED":
        offer.status = "DECLINED"
        offer.decision_reasons.append("KYC not verified — cannot proceed to decision")
        state.log_audit(
            agent="DecisionAgent",
            action="gate_check",
            result="BLOCKED — KYC not VERIFIED",
            regulatory_tag="RBI_KYC_2016_CH6",
        )
        return state

    # Gate check: Documents must be verified
    if doc.status not in ("VERIFIED",):
        offer.status = "DECLINED" if doc.status == "FAILED" else "PENDING"
        offer.decision_reasons.append(f"Document status: {doc.status}")
        state.log_audit(
            agent="DecisionAgent",
            action="gate_check",
            result=f"BLOCKED — documents {doc.status}",
            regulatory_tag="RBI_KYC_2016_CH6_CDD",
        )
        return state

    # Tool 1: Bureau score
    try:
        bureau_result = bureau_score(
            income=profile.monthly_income,
            age=profile.declared_age,
        )
        risk.bureau_score = bureau_result["bureau_score"]
        risk.bureau_band = bureau_result["score_band"]
        state.log_audit(
            agent="DecisionAgent",
            action="bureau_score",
            result=f"Score={bureau_result['bureau_score']} ({bureau_result['score_band']})",
            regulatory_tag="RBI_KYC_2016_CH4_RISK",
            metadata=bureau_result,
        )
    except Exception as e:
        state.log_error("DecisionAgent", "TOOL_FAILURE", f"bureau_score: {e}")
        state.log_audit(agent="DecisionAgent", action="bureau_score", success=False, error=str(e))

    # Determine risk band from fraud flags + bureau
    high_flags = sum(1 for f in risk.fraud_flags if f.get("severity") == "high")
    medium_flags = sum(1 for f in risk.fraud_flags if f.get("severity") == "medium")
    if high_flags >= 2:
        risk.risk_band = "HIGH"
    elif high_flags == 1 or medium_flags >= 2:
        risk.risk_band = "MEDIUM"
    else:
        risk.risk_band = "LOW"

    risk.eligible = high_flags == 0 and profile.monthly_income >= 15000

    # Tool 2: Propensity score
    try:
        prop_result = propensity_score(
            bureau={"bureau_score": risk.bureau_score},
            risk_band=risk.risk_band,
            income=profile.monthly_income,
        )
        risk.propensity_score = prop_result["score"]
        risk.propensity_band = prop_result["band"]
        state.log_audit(
            agent="DecisionAgent",
            action="propensity_score",
            result=f"Score={prop_result['score']:.3f} ({prop_result['band']})",
            regulatory_tag="RBI_KYC_2016_CH4_RISK",
            metadata=prop_result,
        )
    except Exception as e:
        state.log_error("DecisionAgent", "TOOL_FAILURE", f"propensity_score: {e}")
        state.log_audit(agent="DecisionAgent", action="propensity_score", success=False, error=str(e))

    # Compute interest rate based on risk + bureau
    base_rate = 12.0
    if risk.risk_band == "HIGH":
        base_rate += 3.0
    elif risk.risk_band == "MEDIUM":
        base_rate += 1.0
    if risk.bureau_score >= 760:
        base_rate -= 0.7
    elif risk.bureau_score < 620:
        base_rate += 1.3

    # Tool 3: Generate offer
    try:
        tenure_opts = [12, 24, 36, 48]
        offer_amount = min(profile.eligible_amount, profile.requested_loan_amount) \
            if profile.requested_loan_amount <= profile.eligible_amount \
            else profile.eligible_amount

        if not risk.eligible:
            offer.status = "DECLINED"
            offer.decision_reasons.append(f"Not eligible: {risk.reason}")
        else:
            offer_result = generate_offer(
                eligible_amount=offer_amount,
                rate=round(base_rate, 1),
                tenure_options=tenure_opts,
            )
            offer.status = offer_result["status"]
            offer.approved_amount = offer_result["approved_amount"]
            offer.interest_rate = offer_result["interest_rate"]
            offer.tenure_options = offer_result.get("tenure_options", tenure_opts)
            offer.monthly_emi = offer_result["monthly_emi"]
            offer.processing_fee = offer_result["processing_fee"]

        state.log_audit(
            agent="DecisionAgent",
            action="generate_offer",
            result=f"Status={offer.status}, Amount=₹{offer.approved_amount:,.0f}, Rate={offer.interest_rate}%",
            regulatory_tag="RBI_KYC_2016_CH4",
        )
    except Exception as e:
        state.log_error("DecisionAgent", "TOOL_FAILURE", f"generate_offer: {e}")
        state.log_audit(agent="DecisionAgent", action="generate_offer", success=False, error=str(e))

    # Tool 4: RAG query for regulatory justification
    try:
        decision_summary = (
            f"Loan decision: {offer.status}. "
            f"Risk band: {risk.risk_band}. "
            f"Bureau score: {risk.bureau_score}. "
            f"KYC status: {kyc.status}. "
            f"Document status: {doc.status}."
        )
        rag_result = await query_rbi_policy_rag(decision_summary)
        if rag_result.get("citations"):
            citations_text = " | ".join(
                c.get("text", "")[:200] for c in rag_result["citations"][:2]
            )
            offer.rbi_justification = citations_text
            offer.decision_reasons.append(f"RBI compliance: {citations_text[:300]}")
        state.log_audit(
            agent="DecisionAgent",
            action="query_rbi_policy_rag",
            result=f"Retrieved {len(rag_result.get('citations', []))} regulatory citations",
            regulatory_tag="RBI_KYC_2016_RAG",
            metadata={"citation_count": len(rag_result.get("citations", []))},
        )
    except Exception as e:
        state.log_error("DecisionAgent", "TOOL_FAILURE", f"query_rbi_policy_rag: {e}")
        state.log_audit(
            agent="DecisionAgent", action="query_rbi_policy_rag", success=False, error=str(e),
        )

    return state
