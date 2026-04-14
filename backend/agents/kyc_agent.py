"""KYCAgent — Aadhaar/PAN verification, face matching, sanctions screening.

Tool Registry:
    1. verify_aadhaar_format(number)
    2. verhoeff_checksum(number)
    3. face_match(selfie_b64, aadhaar_photo_b64)
    4. check_sanctions_list(name)

Design notes:
- verify_aadhaar_format and verhoeff_checksum are ported from
  services/document_match.py to be individually callable tools.
- face_match produces a simulated confidence score (deterministic
  hash-based for demo reproducibility).
- check_sanctions_list fuzzy-matches against a mock PEP/sanctions list
  per RBI KYC Master Direction Ch.X Section 10(h) and UAPA Section 51A.
"""

from __future__ import annotations

import hashlib
import re
from difflib import SequenceMatcher
from typing import Any

from agents.state import AgentState


# ── Verhoeff tables (identical to document_match.py) ─────────────

_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

_AADHAAR_RE = re.compile(r"^\d{12}$")
_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

# Mock sanctions/PEP list per RBI KYC Master Direction Ch.IX
# In production, this would be sourced from UNSC lists + MHA circulars
_MOCK_SANCTIONS_LIST = [
    "OSAMA BIN LADEN",
    "DAWOOD IBRAHIM KASKAR",
    "HAFIZ MUHAMMAD SAEED",
    "MAULANA MASOOD AZHAR",
    "ZAKIR NAIK",
    "LAKHVI ZAKI UR REHMAN",
    "TIGER MEMON",
    "CHHOTA SHAKEEL",
]


# ── Tool 1: verify_aadhaar_format ────────────────────────────────

def verify_aadhaar_format(number: str) -> dict[str, Any]:
    """Validate Aadhaar number format (12 digits, first digit not 0 or 1).

    Per UIDAI specification:
    - Must be exactly 12 digits
    - First digit cannot be 0 or 1
    - This is a format-only check; checksum is a separate tool
    """
    compact = re.sub(r"\s+", "", number or "")
    if not _AADHAAR_RE.fullmatch(compact):
        return {
            "valid": False,
            "reason": f"Aadhaar must be exactly 12 digits, got '{compact}'",
            "masked": "",
        }
    if compact[0] in {"0", "1"}:
        return {
            "valid": False,
            "reason": "Aadhaar number cannot start with 0 or 1",
            "masked": f"XXXX-XXXX-{compact[-4:]}",
        }
    return {
        "valid": True,
        "reason": "Format valid (12-digit, valid first digit)",
        "masked": f"XXXX-XXXX-{compact[-4:]}",  # RBI masking: show only last 4
    }


# ── Tool 2: verhoeff_checksum ────────────────────────────────────

def verhoeff_checksum(number: str) -> dict[str, Any]:
    """Validate Aadhaar number using the Verhoeff checksum algorithm.

    The Verhoeff algorithm is used by UIDAI to generate the check digit
    (last digit) of every Aadhaar number. A valid Aadhaar will produce
    checksum == 0.
    """
    compact = re.sub(r"\s+", "", number or "")
    if not compact.isdigit() or len(compact) != 12:
        return {
            "valid": False,
            "reason": "Input must be a 12-digit number for Verhoeff validation",
        }

    c = 0
    rev = list(map(int, reversed(compact)))
    for i, digit in enumerate(rev):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][digit]]

    return {
        "valid": c == 0,
        "reason": "Verhoeff checksum passed" if c == 0 else "Verhoeff checksum failed — possible invalid Aadhaar",
    }


# ── Tool 3: face_match ──────────────────────────────────────────

def face_match(selfie_b64: str, aadhaar_photo_b64: str) -> dict[str, Any]:
    """Compare selfie against Aadhaar photo for identity verification.

    This is a simulated match using deterministic hashing for demo
    reproducibility. In production, wire this to a real biometric
    SDK (e.g., AWS Rekognition, Azure Face, or local InsightFace).

    Per RBI V-CIP: live photo must be matched against OVD photo.
    """
    selfie_ok = isinstance(selfie_b64, str) and len(selfie_b64) > 100
    aadhaar_ok = isinstance(aadhaar_photo_b64, str) and len(aadhaar_photo_b64) > 100

    if not selfie_ok:
        return {
            "match": False,
            "score": 0.0,
            "reason": "Selfie image is empty or too small",
        }

    if not aadhaar_ok:
        return {
            "match": False,
            "score": 0.0,
            "reason": "Aadhaar photo is empty or too small (could not extract face from card)",
        }

    # Deterministic simulated match score
    combined = f"{len(selfie_b64)}|{len(aadhaar_photo_b64)}|{selfie_b64[:20]}|{aadhaar_photo_b64[:20]}"
    hashed = int(hashlib.sha256(combined.encode()).hexdigest()[:8], 16)
    score = round(0.55 + (hashed % 41) / 100, 2)  # Range: 0.55–0.95
    threshold = 0.65

    return {
        "match": score >= threshold,
        "score": score,
        "threshold": threshold,
        "reason": f"Face match score {score:.2f} {'≥' if score >= threshold else '<'} threshold {threshold}",
    }


# ── Tool 4: check_sanctions_list ─────────────────────────────────

def check_sanctions_list(name: str) -> dict[str, Any]:
    """Fuzzy-match customer name against sanctions/PEP list.

    Per RBI KYC Master Direction Section 10(h):
    'Suitable system shall be put in place to ensure that the identity
    of the customer does not match with any person or entity whose name
    appears in the sanctions lists circulated by Reserve Bank of India.'

    Uses SequenceMatcher with 0.85 threshold for fuzzy matching.
    """
    normalized = (name or "").strip().upper()
    if not normalized:
        return {
            "clear": False,
            "reason": "Name is empty — cannot verify against sanctions list",
            "matches": [],
        }

    matches: list[dict] = []
    for sanctioned in _MOCK_SANCTIONS_LIST:
        ratio = SequenceMatcher(None, normalized, sanctioned).ratio()
        if ratio >= 0.85:
            matches.append({
                "sanctioned_name": sanctioned,
                "similarity": round(ratio, 3),
            })

    return {
        "clear": len(matches) == 0,
        "reason": "No sanctions match found" if not matches else f"Potential sanctions match: {matches[0]['sanctioned_name']}",
        "matches": matches,
        "checked_against": "UNSC_AL_QAIDA + UNSC_1988 + MHA_UAPA (mock)",
    }


# ── PAN validation helper (bonus — used internally) ──────────────

def _verify_pan_format(number: str) -> dict[str, Any]:
    """Validate PAN card format: ABCDE1234F pattern."""
    compact = re.sub(r"\s+", "", (number or "")).upper()
    valid = _PAN_RE.fullmatch(compact) is not None
    return {
        "valid": valid,
        "reason": "PAN format valid" if valid else f"Invalid PAN format: '{compact}'",
    }


# ── Agent Runner ─────────────────────────────────────────────────

async def run_kyc_agent(state: AgentState, payload: dict[str, Any]) -> AgentState:
    """Execute the KYCAgent phase.

    Expected payload keys:
        aadhaar_number, pan_number, selfie_image (b64),
        aadhaar_photo_b64 (optional — extracted from doc phase)
    """
    aadhaar = (payload.get("aadhaar_number") or "").strip()
    pan = (payload.get("pan_number") or "").strip()
    selfie = payload.get("selfie_image") or ""
    aadhaar_photo = payload.get("aadhaar_photo_b64") or ""

    kyc = state.kyc_status
    kyc.aadhaar_number = aadhaar
    kyc.pan_number = pan

    # Tool 1: Aadhaar format validation
    try:
        aadhaar_result = verify_aadhaar_format(aadhaar)
        kyc.aadhaar_valid = aadhaar_result["valid"]
        state.log_audit(
            agent="KYCAgent",
            action="verify_aadhaar_format",
            result=f"Valid={aadhaar_result['valid']}: {aadhaar_result['reason']}",
            regulatory_tag="RBI_KYC_2016_S3_OVD",
            metadata={"masked": aadhaar_result.get("masked")},
        )
    except Exception as e:
        state.log_error("KYCAgent", "TOOL_FAILURE", f"verify_aadhaar_format: {e}")
        state.log_audit(agent="KYCAgent", action="verify_aadhaar_format", success=False, error=str(e))

    # Tool 2: Verhoeff checksum (only if format is valid)
    if kyc.aadhaar_valid:
        try:
            checksum_result = verhoeff_checksum(aadhaar)
            kyc.aadhaar_checksum_valid = checksum_result["valid"]
            state.log_audit(
                agent="KYCAgent",
                action="verhoeff_checksum",
                result=checksum_result["reason"],
                regulatory_tag="UIDAI_VERHOEFF",
            )
        except Exception as e:
            state.log_error("KYCAgent", "TOOL_FAILURE", f"verhoeff_checksum: {e}")
            state.log_audit(agent="KYCAgent", action="verhoeff_checksum", success=False, error=str(e))

    # PAN format validation (internal helper, not an LLM tool)
    try:
        pan_result = _verify_pan_format(pan)
        kyc.pan_valid = pan_result["valid"]
        state.log_audit(
            agent="KYCAgent",
            action="verify_pan_format",
            result=pan_result["reason"],
            regulatory_tag="RBI_KYC_2016_S3_OVD",
        )
    except Exception as e:
        state.log_error("KYCAgent", "TOOL_FAILURE", f"verify_pan_format: {e}")

    # Tool 3: Face match
    try:
        selfie_ok = isinstance(selfie, str) and len(selfie) > 100
        kyc.selfie_captured = selfie_ok
        if selfie_ok:
            face_result = face_match(selfie, aadhaar_photo)
            kyc.face_match_score = face_result["score"]
            state.log_audit(
                agent="KYCAgent",
                action="face_match",
                result=f"Match={face_result['match']}, score={face_result['score']:.2f}",
                regulatory_tag="VCIP_FACE_MATCH",
                metadata=face_result,
            )
        else:
            state.log_audit(
                agent="KYCAgent",
                action="face_match",
                result="Skipped — no selfie provided",
                regulatory_tag="VCIP_FACE_MATCH",
            )
    except Exception as e:
        state.log_error("KYCAgent", "TOOL_FAILURE", f"face_match: {e}")
        state.log_audit(agent="KYCAgent", action="face_match", success=False, error=str(e))

    # Tool 4: Sanctions check
    try:
        sanctions_result = check_sanctions_list(state.customer_profile.name)
        kyc.sanctions_clear = sanctions_result["clear"]
        state.log_audit(
            agent="KYCAgent",
            action="check_sanctions_list",
            result=sanctions_result["reason"],
            regulatory_tag="RBI_KYC_2016_S10H_UAPA_51A",
            metadata=sanctions_result,
        )
        if not sanctions_result["clear"]:
            kyc.risk_flag = "HIGH_RISK"
            state.risk_assessment.fraud_flags.append({
                "flag": "SANCTIONS_MATCH",
                "severity": "high",
                "details": sanctions_result["reason"],
            })
    except Exception as e:
        state.log_error("KYCAgent", "TOOL_FAILURE", f"check_sanctions_list: {e}")
        state.log_audit(agent="KYCAgent", action="check_sanctions_list", success=False, error=str(e))

    # Determine overall KYC status
    all_passed = all([
        kyc.aadhaar_valid,
        kyc.aadhaar_checksum_valid,
        kyc.pan_valid,
        kyc.selfie_captured,
        kyc.face_match_score >= 0.65,
        kyc.sanctions_clear,
    ])
    kyc.status = "VERIFIED" if all_passed else "FAILED"

    # Age-based risk flag (from existing journey_core logic)
    declared_age = state.customer_profile.declared_age
    if declared_age > 0:
        face_age = payload.get("face_estimated_age")
        if face_age is not None:
            if abs(float(face_age) - declared_age) >= 8:
                kyc.risk_flag = "HIGH_RISK"

    state.log_audit(
        agent="KYCAgent",
        action="kyc_status_determination",
        result=f"Overall KYC: {kyc.status} | Risk: {kyc.risk_flag}",
        regulatory_tag="RBI_KYC_2016_CH6",
    )

    return state
