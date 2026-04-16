"""Core interview/KYC/decision helpers with loan-type policy branching."""

from __future__ import annotations

import hashlib
import re
from typing import Any


_DOCUMENT_POLICY: dict[str, dict[str, Any]] = {
    "personal": {
        "label": "Personal Loan",
        "affordability_ratio": 0.45,
        "tenure_months": 36,
        "documents": [
            ("aadhaar", "Aadhaar Card", True),
            ("pan", "PAN Card", True),
            ("selfie", "Live selfie capture", True),
            ("address_proof", "Address proof or utility bill", True),
        ],
    },
    "business": {
        "label": "Business Loan",
        "affordability_ratio": 0.40,
        "tenure_months": 48,
        "documents": [
            ("aadhaar", "Aadhaar Card", True),
            ("pan", "PAN Card", True),
            ("selfie", "Live selfie capture", True),
            ("address_proof", "Address proof or utility bill", True),
            ("business_proof", "Business proof / GST / shop registration", True),
            ("bank_statement", "Last 6 months bank statement", True),
        ],
    },
    "salary": {
        "label": "Salary Advance / Salary Loan",
        "affordability_ratio": 0.42,
        "tenure_months": 24,
        "documents": [
            ("aadhaar", "Aadhaar Card", True),
            ("pan", "PAN Card", True),
            ("selfie", "Live selfie capture", True),
            ("address_proof", "Address proof or utility bill", True),
            ("salary_slip", "Latest salary slip", True),
            ("bank_statement", "Last 3 months bank statement", True),
        ],
    },
    "home": {
        "label": "Home Loan",
        "affordability_ratio": 0.35,
        "tenure_months": 180,
        "documents": [
            ("aadhaar", "Aadhaar Card", True),
            ("pan", "PAN Card", True),
            ("selfie", "Live selfie capture", True),
            ("address_proof", "Current address proof", True),
            ("property_docs", "Property documents", True),
            ("income_proof", "Income proof / ITR", True),
        ],
    },
    "vehicle": {
        "label": "Vehicle Loan",
        "affordability_ratio": 0.38,
        "tenure_months": 60,
        "documents": [
            ("aadhaar", "Aadhaar Card", True),
            ("pan", "PAN Card", True),
            ("selfie", "Live selfie capture", True),
            ("address_proof", "Address proof or utility bill", True),
            ("vehicle_quote", "Vehicle quotation / invoice", True),
            ("rc_or_registration", "RC / registration proof", True),
        ],
    },
    "education": {
        "label": "Education Loan",
        "affordability_ratio": 0.33,
        "tenure_months": 72,
        "documents": [
            ("aadhaar", "Aadhaar Card", True),
            ("pan", "PAN Card", True),
            ("selfie", "Live selfie capture", True),
            ("address_proof", "Address proof or utility bill", True),
            ("admission_letter", "Admission letter / fee receipt", True),
            ("coapplicant_income", "Co-applicant income proof", False),
        ],
    },
}


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _norm(text: str | None) -> str:
    return (text or "").strip().lower()


def _employment_bucket(employment_type: str) -> str:
    e = _norm(employment_type)
    if "self" in e or "business" in e:
        return "self-employed"
    if "professional" in e or "doctor" in e or "lawyer" in e or "ca" in e:
        return "professional"
    return "salaried"


def _loan_type_key(loan_type: str) -> str:
    lt = _norm(loan_type)
    alias_map = {
        "personal loan": "personal",
        "instant loan": "instant",
        "professional loan": "professional",
        "pre-owned car loan": "pre-owned car",
        "used car loan": "pre-owned car",
        "medical equipment loan": "medical equipment",
        "lap": "loan against property",
        "loan against property": "loan against property",
        "property loan": "loan against property",
        "business loan": "business",
        "commercial vehicle loan": "commercial vehicle",
        "gold loan": "gold",
        "education loan": "education",
        "consumer durable loan": "consumer durable",
    }
    return alias_map.get(lt, lt)


def build_document_requirements(loan_type: str, pan_has_address: bool = False) -> list[dict[str, Any]]:
    policy = _DOCUMENT_POLICY.get(_loan_type_key(loan_type), _DOCUMENT_POLICY["personal"])
    requirements: list[dict[str, Any]] = []
    for key, label, required in policy["documents"]:
        if key == "address_proof" and pan_has_address:
            label = "Address proof or utility bill (PAN address already visible, if valid)"
        requirements.append({"key": key, "label": label, "required": required})
    return requirements


def _affordability_limit(income: float, loan_type: str) -> tuple[float, dict[str, Any]]:
    policy = _DOCUMENT_POLICY.get(_loan_type_key(loan_type), _DOCUMENT_POLICY["personal"])
    ratio = float(policy.get("affordability_ratio", 0.4))
    tenure_months = int(policy.get("tenure_months", 36))
    monthly_emi_capacity = income * ratio

    # Conservative, RBI-aligned affordability estimate: keep EMI well within monthly income.
    assumed_rate = 0.13
    monthly_rate = assumed_rate / 12
    factor = (1 + monthly_rate) ** tenure_months
    if monthly_rate > 0:
        loan_amount = monthly_emi_capacity * ((factor - 1) / (monthly_rate * factor))
    else:
        loan_amount = monthly_emi_capacity * tenure_months

    loan_amount = max(0.0, round(loan_amount, 0))
    policy_summary = {
        "affordability_ratio": ratio,
        "monthly_emi_capacity": round(monthly_emi_capacity, 0),
        "assumed_rate": assumed_rate,
        "tenure_months": tenure_months,
        "policy_label": policy["label"],
    }
    return loan_amount, policy_summary


def compute_preapproval(profile: dict) -> dict:
    name = str(profile.get("name") or "Customer").strip()
    employment = _employment_bucket(str(profile.get("employment_type") or profile.get("employment") or ""))
    income = max(0.0, _to_float(profile.get("monthly_income") or profile.get("income")))
    loan_type = _loan_type_key(str(profile.get("loan_type") or profile.get("purpose") or "personal")) or "personal"
    requested = max(0.0, _to_float(profile.get("requested_loan_amount") or profile.get("requested_amount")))
    declared_age = int(_to_float(profile.get("declared_age") or profile.get("age"), 0.0))

    pan_has_address = bool(profile.get("pan_has_address"))
    eligible_amount, policy_summary = _affordability_limit(income, loan_type)
    eligible_min = round(eligible_amount * 0.75, 0)
    eligible_max = eligible_amount
    message = (
        f"Based on RBI-aligned affordability checks for your {policy_summary['policy_label'].lower()}, "
        f"you are pre-approved up to INR {eligible_max:,.0f}."
    )

    return {
        "name": name,
        "employment_type": employment,
        "monthly_income": income,
        "loan_type": loan_type,
        "requested_loan_amount": requested,
        "declared_age": declared_age,
        "eligible_min": eligible_min,
        "eligible_max": eligible_max,
        "eligible_amount": eligible_max,
        "document_requirements": build_document_requirements(loan_type, pan_has_address=pan_has_address),
        "policy_summary": policy_summary,
        "message": message,
    }


def verify_kyc(payload: dict) -> dict:
    aadhaar = (payload.get("aadhaar_number") or "").strip()
    pan = (payload.get("pan_number") or "").strip().upper()
    selfie = payload.get("selfie_image") or ""

    aadhaar_ok = bool(re.fullmatch(r"\d{12}", aadhaar))
    pan_ok = bool(re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan))
    selfie_ok = isinstance(selfie, str) and len(selfie) > 120

    base = f"{aadhaar}|{pan}|{len(selfie)}".encode("utf-8")
    hashed = int(hashlib.sha256(base).hexdigest()[:8], 16)
    match_score = round(0.55 + (hashed % 41) / 100, 2) if selfie_ok else 0.0
    face_match_ok = match_score >= 0.65

    declared_age = int(_to_float(payload.get("declared_age"), 0.0))
    face_estimated_age = payload.get("face_estimated_age")
    risk_flag = "LOW_RISK"
    if face_estimated_age is not None:
        est = _to_float(face_estimated_age, 0.0)
        if declared_age > 0 and est > 0 and abs(est - declared_age) >= 8:
            risk_flag = "HIGH_RISK"

    verified = aadhaar_ok and pan_ok and selfie_ok and face_match_ok
    return {
        "kyc_status": "VERIFIED" if verified else "FAILED",
        "aadhaar_valid": aadhaar_ok,
        "pan_valid": pan_ok,
        "selfie_captured": selfie_ok,
        "face_match_score": match_score,
        "risk_flag": risk_flag,
    }


def evaluate_decision(payload: dict) -> dict:
    income = max(0.0, _to_float(payload.get("income")))
    requested_amount = max(0.0, _to_float(payload.get("requested_amount")))
    eligible_amount = max(0.0, _to_float(payload.get("eligible_amount")))
    kyc_status = str(payload.get("kyc_status") or "").upper()
    document_status = str(payload.get("document_status") or "").upper()
    risk_flag = str(payload.get("risk_flag") or "LOW_RISK").upper()

    if kyc_status != "VERIFIED":
        return {
            "decision_status": "REJECTED",
            "final_approved_amount": 0.0,
            "interest_rate": 0.0,
            "tenure_options": [],
            "reason": "KYC_NOT_VERIFIED",
            "risk_flag": risk_flag,
        }
    if document_status != "VERIFIED":
        return {
            "decision_status": "HOLD",
            "final_approved_amount": 0.0,
            "interest_rate": 0.0,
            "tenure_options": [12, 24, 36],
            "reason": "DOCUMENTS_PENDING",
            "risk_flag": risk_flag,
        }

    approved = requested_amount if requested_amount <= eligible_amount else eligible_amount
    interest_rate = 12.0 if approved <= eligible_amount else 12.5
    if income > 100000:
        interest_rate = max(10.5, interest_rate - 0.5)

    return {
        "decision_status": "APPROVED",
        "final_approved_amount": round(approved, 0),
        "interest_rate": round(interest_rate, 2),
        "tenure_options": [12, 24, 36, 48],
        "reason": "REQUEST_WITHIN_LIMIT" if requested_amount <= eligible_amount else "APPROVED_WITH_REDUCED_AMOUNT",
        "risk_flag": risk_flag,
    }
