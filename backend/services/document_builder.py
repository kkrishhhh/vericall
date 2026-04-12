"""Build auto-filled onboarding document payloads from session audit records."""

from __future__ import annotations

from datetime import datetime


def _pick(record: dict, *keys: str, default=None):
    for k in keys:
        if k in record and record[k] not in (None, ""):
            return record[k]
    return default


def _iso_to_local(iso_text: str | None) -> str:
    if not iso_text:
        return ""
    try:
        dt = datetime.fromisoformat(iso_text.replace("Z", "+00:00"))
        return dt.strftime("%d-%m-%Y %H:%M")
    except ValueError:
        return str(iso_text)


def build_document_pack(session: dict) -> dict:
    extracted = session.get("extracted") or {}
    risk = session.get("risk") or {}
    offer = session.get("offer") or {}
    bureau = session.get("bureau") or {}
    propensity = session.get("propensity") or {}

    name = str(_pick(extracted, "name", default=""))
    age = int(_pick(extracted, "age", default=0) or 0)
    income = float(_pick(extracted, "income", default=0) or 0)
    employment = str(_pick(extracted, "employment", default=""))
    purpose = str(_pick(extracted, "purpose", "loan_purpose", default=""))
    consent = bool(_pick(extracted, "consent", default=False))

    customer_fields = {
        "applicant_name": name,
        "phone": session.get("phone") or "",
        "declared_age": age,
        "employment_type": employment,
        "monthly_income_inr": income,
        "loan_purpose": purpose,
        "verbal_consent_captured": consent,
        "session_id": session.get("session_id") or "",
        "application_timestamp": _iso_to_local(session.get("logged_at")),
    }

    decision_fields = {
        "risk_band": risk.get("risk_band") or "",
        "risk_score": risk.get("risk_score") if risk.get("risk_score") is not None else "",
        "bureau_score": bureau.get("bureau_score") if bureau.get("bureau_score") is not None else "",
        "propensity_score": propensity.get("score") if propensity.get("score") is not None else "",
        "offer_status": offer.get("status") or "",
        "approved_amount": offer.get("loan_amount") or 0,
        "interest_rate": offer.get("interest_rate") or 0,
        "tenure_months": offer.get("tenure_months") or 0,
        "monthly_emi": offer.get("monthly_emi") or 0,
    }

    application_form = {
        "document_type": "loan_application_form",
        "title": "Loan Application Form (Auto-Filled)",
        "fields": {
            **customer_fields,
            **decision_fields,
        },
        "review_required_fields": [
            "applicant_name",
            "phone",
            "monthly_income_inr",
            "loan_purpose",
        ],
    }

    kyc_summary = {
        "document_type": "kyc_summary_sheet",
        "title": "KYC & Verification Summary",
        "fields": {
            "applicant_name": name,
            "phone": session.get("phone") or "",
            "face_age_estimate": (offer.get("verification_summary") or {}).get("age_estimate"),
            "face_age_verified": (offer.get("verification_summary") or {}).get("age_verified"),
            "location_verified": (offer.get("verification_summary") or {}).get("location_verified"),
            "consent_captured": (offer.get("verification_summary") or {}).get("consent_captured"),
            "fraud_flags": [f.get("flag") for f in (risk.get("fraud_flags") or [])],
            "decision_trace": session.get("decision_trace") or risk.get("decision_reasons") or [],
        },
    }

    sanction_note = {
        "document_type": "offer_decision_note",
        "title": "Offer Decision Note",
        "fields": {
            "offer_status": offer.get("status") or "",
            "approved_amount": offer.get("loan_amount") or 0,
            "interest_rate": offer.get("interest_rate") or 0,
            "tenure_months": offer.get("tenure_months") or 0,
            "monthly_emi": offer.get("monthly_emi") or 0,
            "risk_band": risk.get("risk_band") or "",
            "risk_score": risk.get("risk_score") if risk.get("risk_score") is not None else "",
            "reason_codes": offer.get("reason_codes") or [],
            "explainability": offer.get("explainability") or {},
        },
    }

    return {
        "session_id": session.get("session_id"),
        "schema_version": session.get("schema_version") or "2026-04",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "documents": [application_form, kyc_summary, sanction_note],
    }
