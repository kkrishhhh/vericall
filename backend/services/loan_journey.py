"""Modular NBFC-style loan journey helpers: interview, KYC, docs, decision."""

from __future__ import annotations

import hashlib
import re
from typing import Any


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


def compute_preapproval(profile: dict) -> dict:
    """Compute simple pre-approval amount X from interview details."""
    name = str(profile.get("name") or "Customer").strip()
    employment = _employment_bucket(str(profile.get("employment_type") or profile.get("employment") or ""))
    income = max(0.0, _to_float(profile.get("monthly_income") or profile.get("income")))
    loan_type = _loan_type_key(str(profile.get("loan_type") or profile.get("purpose") or "personal")) or "personal"
    requested = max(0.0, _to_float(profile.get("requested_loan_amount") or profile.get("requested_amount")))
    declared_age = int(_to_float(profile.get("declared_age") or profile.get("age"), 0.0))

    if employment == "salaried":
        mult_min, mult_max = 10, 15
    elif employment == "self-employed":
        mult_min, mult_max = 6, 10
    else:  # professional
        mult_min, mult_max = 8, 12

    eligible_min = round(income * mult_min, 0)
    eligible_max = round(income * mult_max, 0)

    message = (
        f"You requested INR {requested:,.0f}. "
        f"Based on your profile, you are pre-approved up to INR {eligible_max:,.0f}."
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
        "message": message,
    }


def verify_kyc(payload: dict) -> dict:
    """Mock Aadhaar/PAN/selfie verification for KYC-only identity checks."""
    aadhaar = (payload.get("aadhaar_number") or "").strip()
    pan = (payload.get("pan_number") or "").strip().upper()
    selfie = payload.get("selfie_image") or ""

    aadhaar_ok = bool(re.fullmatch(r"\d{12}", aadhaar))
    pan_ok = bool(re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan))
    selfie_ok = isinstance(selfie, str) and len(selfie) > 120

    base = f"{aadhaar}|{pan}|{len(selfie)}".encode("utf-8")
    hashed = int(hashlib.sha256(base).hexdigest()[:8], 16)
    match_score = round(0.55 + (hashed % 41) / 100, 2) if selfie_ok else 0.0  # 0.55..0.95
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


def get_required_documents(loan_type: str) -> list[str]:
    """Return required documents by loan type."""
    lt = _loan_type_key(loan_type)
    mapping = {
        "personal": [
            "Aadhaar Card",
            "PAN Card",
            "Bank Statements (3-6 months)",
            "Salary Slips (if salaried) / ITR (if self-employed)",
            "Selfie / Video KYC",
        ],
        "instant": [
            "Aadhaar Card",
            "PAN Card",
            "Bank Account Access (Net Banking / AA)",
        ],
        "professional": [
            "Aadhaar Card",
            "PAN Card",
            "Professional Degree Certificate",
            "Registration Certificate (e.g., ICAI, Medical Council)",
            "Bank Statements (6-12 months)",
            "ITR / Financials",
        ],
        "pre-owned car": [
            "Aadhaar Card",
            "PAN Card",
            "Bank Statements",
            "Salary Slips / ITR",
            "Vehicle RC",
            "Insurance Copy",
        ],
        "medical equipment": [
            "Aadhaar Card",
            "PAN Card",
            "Business Proof",
            "Financial Statements (2-3 years)",
            "GST Returns",
            "Bank Statements",
            "Equipment Quotation",
        ],
        "loan against property": [
            "Aadhaar Card",
            "PAN Card",
            "Property Documents (Title/Sale Deed)",
            "Property Tax Receipts",
            "Salary Slips / ITR",
            "Bank Statements (6-12 months)",
        ],
        "business": [
            "Aadhaar Card",
            "PAN Card",
            "GST Registration / Business Proof",
            "Bank Statements (6-12 months)",
            "ITR (1-2 years)",
        ],
        "commercial vehicle": [
            "Aadhaar Card",
            "PAN Card",
            "Driving License",
            "Vehicle Quotation",
            "Bank Statements",
            "Income Proof",
        ],
        "gold": [
            "Aadhaar Card",
            "PAN Card",
            "Gold (for valuation)",
        ],
        "education": [
            "Aadhaar Card",
            "PAN Card",
            "Admission Letter",
            "Fee Structure",
            "Academic Records",
            "Co-applicant Income Proof",
        ],
        "consumer durable": [
            "Aadhaar Card",
            "PAN Card",
            "Basic KYC / Income Proof (if required)",
        ],
    }
    return mapping.get(lt, ["Aadhaar Card", "PAN Card", "Bank Statements", "Income Proof"])


def verify_documents(required_documents: list[str], uploaded_documents: list[str]) -> dict:
    uploaded_set = {str(x).strip().lower() for x in uploaded_documents if str(x).strip()}
    missing = [d for d in required_documents if d.strip().lower() not in uploaded_set]
    verified = len(missing) == 0
    return {
        "document_status": "VERIFIED" if verified else "PENDING",
        "missing_documents": missing,
    }


def evaluate_decision(payload: dict) -> dict:
    """Simple rule-based final decision engine."""
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

    if requested_amount <= eligible_amount:
        approved = requested_amount
    else:
        approved = eligible_amount

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
