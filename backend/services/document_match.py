"""VeriCall Document Matcher Phase — Groq Vision Agent."""

import os
import re
import json
from groq import Groq

# Reuse Groq API Key
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
VISION_MODEL = os.environ.get(
    "GROQ_VISION_MODEL",
    "meta-llama/llama-4-scout-17b-16e-instruct",
)

_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_AADHAAR_RE = re.compile(r"^[0-9]{12}$")
_BLOOD_GROUP_RE = re.compile(r"^(A|B|AB|O)[+-]$", re.IGNORECASE)

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


def _clean_b64(image_b64: str) -> str:
    return image_b64.split(",", 1)[1] if "," in image_b64 else image_b64


def _norm_text(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip().upper()


def _norm_gender(s: str | None) -> str:
    t = _norm_text(s)
    if t in {"M", "MALE"}:
        return "MALE"
    if t in {"F", "FEMALE"}:
        return "FEMALE"
    if t in {"O", "OTHER", "OTHERS"}:
        return "OTHER"
    return t


def _norm_dob(s: str | None) -> str:
    t = _norm_text(s)
    if not t:
        return ""
    t = t.replace(".", "/").replace("-", "/")
    parts = t.split("/")
    if len(parts) != 3:
        return t
    if len(parts[0]) == 4:  # yyyy/mm/dd -> dd/mm/yyyy
        parts = [parts[2], parts[1], parts[0]]
    return "/".join(parts)


def _field_consistent(values: list[str]) -> bool:
    normalized = [v for v in values if v]
    if not normalized:
        return False
    return len(set(normalized)) == 1


def _verhoeff_validate(num: str) -> bool:
    c = 0
    rev = list(map(int, reversed(num)))
    for i, digit in enumerate(rev):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][digit]]
    return c == 0


def _is_valid_aadhaar(number: str | None) -> bool:
    if not number:
        return False
    compact = re.sub(r"\s+", "", number)
    if not _AADHAAR_RE.fullmatch(compact):
        return False
    if compact[0] in {"0", "1"}:
        return False
    return _verhoeff_validate(compact)


def _is_valid_pan(number: str | None) -> bool:
    if not number:
        return False
    compact = re.sub(r"\s+", "", number).upper()
    return _PAN_RE.fullmatch(compact) is not None


def verify_address_match(aadhaar_b64: str, pan_b64: str, proof_b64: str) -> dict:
    """Extract identity fields across docs and validate address/id consistency."""
    prompt = """You are a strict KYC document checker.
You will get 3 images in this exact order:
1) Aadhaar
2) PAN
3) Address proof

TASK:
1) Extract name, dob, gender from all 3 docs when visible.
2) Extract blood_group if present in any doc.
3) Extract aadhaar_number and pan_number if present.
4) Extract full address from Aadhaar and Address Proof and compare whether same physical location.
5) Return strict JSON only.

JSON schema:
{
  "aadhaar": {"name": "...", "dob": "...", "gender": "...", "blood_group": "...", "aadhaar_number": "...", "address": "..."},
  "pan": {"name": "...", "dob": "...", "gender": "...", "pan_number": "..."},
  "address_proof": {"name": "...", "dob": "...", "gender": "...", "blood_group": "...", "address": "..."},
  "address_match": true,
  "address_reason": "short reason"
}
Use null for unknown fields."""

    aadhaar_b64 = _clean_b64(aadhaar_b64)
    pan_b64 = _clean_b64(pan_b64)
    proof_b64 = _clean_b64(proof_b64)

    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{aadhaar_b64}"}},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{pan_b64}"}},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{proof_b64}"}},
        ],
    }]

    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=messages,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)

        aadhaar = data.get("aadhaar") or {}
        pan = data.get("pan") or {}
        address_proof = data.get("address_proof") or {}

        name_match = _field_consistent([
            _norm_text(aadhaar.get("name")),
            _norm_text(pan.get("name")),
            _norm_text(address_proof.get("name")),
        ])
        dob_match = _field_consistent([
            _norm_dob(aadhaar.get("dob")),
            _norm_dob(pan.get("dob")),
            _norm_dob(address_proof.get("dob")),
        ])
        gender_match = _field_consistent([
            _norm_gender(aadhaar.get("gender")),
            _norm_gender(pan.get("gender")),
            _norm_gender(address_proof.get("gender")),
        ])

        blood_group = aadhaar.get("blood_group") or address_proof.get("blood_group")
        blood_group = _norm_text(blood_group) or None
        if blood_group and _BLOOD_GROUP_RE.fullmatch(blood_group) is None:
            blood_group = None

        aadhaar_number = aadhaar.get("aadhaar_number")
        pan_number = pan.get("pan_number")
        aadhaar_number_valid = _is_valid_aadhaar(aadhaar_number)
        pan_number_valid = _is_valid_pan(pan_number)

        address_match = bool(data.get("address_match"))
        address_reason = str(data.get("address_reason") or "").strip() or "Address match status unavailable."

        overall_ok = all([
            address_match,
            name_match,
            dob_match,
            gender_match,
            aadhaar_number_valid,
            pan_number_valid,
        ])
        failed_checks = []
        if not address_match:
            failed_checks.append("address mismatch")
        if not name_match:
            failed_checks.append("name mismatch")
        if not dob_match:
            failed_checks.append("dob mismatch")
        if not gender_match:
            failed_checks.append("gender mismatch")
        if not aadhaar_number_valid:
            failed_checks.append("invalid Aadhaar number")
        if not pan_number_valid:
            failed_checks.append("invalid PAN number")

        reason = "All document checks passed."
        if failed_checks:
            reason = f"{address_reason} Additional issues: {', '.join(failed_checks)}."

        return {
            "aadhaar_address": aadhaar.get("address"),
            "proof_address": address_proof.get("address"),
            "matches": overall_ok,
            "reason": reason,
            "name_match": name_match,
            "dob_match": dob_match,
            "gender_match": gender_match,
            "aadhaar_number_valid": aadhaar_number_valid,
            "pan_number_valid": pan_number_valid,
            "blood_group": blood_group,
            "extracted": {
                "aadhaar": aadhaar,
                "pan": pan,
                "address_proof": address_proof,
                "address_match": address_match,
                "address_reason": address_reason,
            },
        }

    except Exception as e:
        msg = str(e)
        if "model_decommissioned" in msg:
            msg = (
                f"{msg}. Update GROQ_VISION_MODEL to a currently supported vision model, "
                "for example: meta-llama/llama-4-scout-17b-16e-instruct"
            )
        print(f"Vision API Error: {msg}")
        return {
            "aadhaar_address": "Error extracting",
            "proof_address": "Error extracting",
            "matches": False,
            "reason": f"System encountered an error processing the images: {msg}",
            "name_match": False,
            "dob_match": False,
            "gender_match": False,
            "aadhaar_number_valid": False,
            "pan_number_valid": False,
            "blood_group": None,
            "extracted": {},
        }
