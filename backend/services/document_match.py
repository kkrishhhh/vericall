"""Vantage AI Document Matcher Phase — Groq Vision Agent."""

import os
import re
import json
import base64
from difflib import SequenceMatcher
import httpx
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


# ── Document Forensics ──────────────────────────────────────────

def check_document_forensics(image_b64: str, doc_type: str = "aadhaar") -> dict:
    """Check a document image for signs of tampering or AI generation.

    Performs 3 forensic checks:
    1. QR code extraction (real Aadhaar cards have scannable QR codes)
    2. Metadata analysis (AI-generated images have unusual EXIF patterns)
    3. Edge sharpness analysis (AI docs have unusually perfect/sharp edges)

    Args:
        image_b64: Base64-encoded document image.
        doc_type: Document type — "aadhaar", "pan", or "address_proof".

    Returns:
        Dict with forensic analysis results and overall score (0-1).
    """
    import io

    cleaned = _clean_b64(image_b64)

    qr_found = False
    qr_data = None
    qr_data_matches_declared = False
    suspected_digital_fake = False
    font_consistency_score = 0.85  # Default: assume OK unless flagged
    forensics_flags = []

    # ── 1. QR Code Extraction (pyzbar) ──
    try:
        import cv2
        import numpy as np
        from pyzbar import pyzbar as pyzbar_lib

        image_bytes = base64.b64decode(cleaned)
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if image is not None:
            decoded_objects = pyzbar_lib.decode(image)
            for obj in decoded_objects:
                if obj.type == "QRCODE":
                    qr_found = True
                    try:
                        qr_data = obj.data.decode("utf-8")
                    except Exception:
                        qr_data = str(obj.data)
                    break

            if doc_type == "aadhaar":
                if qr_found and qr_data:
                    # Real Aadhaar QR contains XML/JSON with holder data
                    aadhaar_indicators = ["uid", "name", "dob", "gender", "aadhaar", "pincode"]
                    matches = sum(1 for ind in aadhaar_indicators if ind.lower() in qr_data.lower())
                    qr_data_matches_declared = matches >= 2
                elif not qr_found:
                    forensics_flags.append("no_qr_code_found")
    except ImportError:
        forensics_flags.append("pyzbar_not_available")
    except Exception:
        forensics_flags.append("qr_extraction_error")

    # ── 2. Metadata / AI Generation Analysis ──
    try:
        from PIL import Image as PILImage
        from PIL.ExifTags import TAGS

        image_bytes = base64.b64decode(cleaned)
        img = PILImage.open(io.BytesIO(image_bytes))

        exif_data = img._getexif() if hasattr(img, "_getexif") else None
        has_exif = exif_data is not None and len(exif_data) > 0

        # AI-generated images typically lack camera EXIF data
        if has_exif:
            tag_names = set()
            for tag_id, value in exif_data.items():
                tag_name = TAGS.get(tag_id, str(tag_id))
                tag_names.add(tag_name)

            # Real camera photos have Make, Model, DateTime
            camera_tags = {"Make", "Model", "DateTime", "ExifOffset"}
            has_camera_info = bool(camera_tags & tag_names)

            # Check software field for AI tool indicators
            software = str(exif_data.get(0x0131, "")).lower()
            ai_indicators = ["dall-e", "midjourney", "stable diffusion", "photoshop",
                           "canva", "figma", "gimp", "paint"]
            if any(ind in software for ind in ai_indicators):
                suspected_digital_fake = True
                forensics_flags.append(f"suspicious_software: {software}")
        else:
            # No EXIF at all — could be screenshot or AI-generated
            forensics_flags.append("no_exif_metadata")

        # Check image dimensions — screenshots are often exact screen sizes
        w, h = img.size
        common_screen_sizes = [
            (1920, 1080), (1366, 768), (1440, 900), (2560, 1440),
            (1080, 1920), (768, 1366), (375, 812), (414, 896),
        ]
        if (w, h) in common_screen_sizes:
            forensics_flags.append("screenshot_dimensions_detected")
            suspected_digital_fake = True

    except ImportError:
        forensics_flags.append("pillow_not_available")
    except Exception:
        forensics_flags.append("metadata_analysis_error")

    # ── 3. Edge Sharpness Analysis ──
    try:
        import cv2
        import numpy as np

        image_bytes = base64.b64decode(cleaned)
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)

        if image is not None:
            # Laplacian variance — very high = suspiciously sharp (AI-gen),
            # very low = blurry photo of a photo
            laplacian = cv2.Laplacian(image, cv2.CV_64F)
            variance = laplacian.var()

            if variance > 3000:
                forensics_flags.append("unusually_sharp_edges")
                font_consistency_score = max(0.4, font_consistency_score - 0.25)
            elif variance < 20:
                forensics_flags.append("extremely_blurry")
                font_consistency_score = max(0.3, font_consistency_score - 0.35)
    except Exception:
        forensics_flags.append("edge_analysis_error")

    # ── Compute overall forensics score ──
    score = 1.0
    # QR code is the strongest signal for Aadhaar
    if doc_type == "aadhaar":
        if qr_found and qr_data_matches_declared:
            score = min(score, 0.95)  # Strong authenticity signal
        elif qr_found and not qr_data_matches_declared:
            score = min(score, 0.65)
        else:
            score = min(score, 0.45)  # No QR on Aadhaar is suspicious

    if suspected_digital_fake:
        score = min(score, 0.25)

    # Penalty for each flag
    score = max(0.05, score - len(forensics_flags) * 0.08)

    return {
        "qr_found": qr_found,
        "qr_data": qr_data[:200] if qr_data else None,  # Truncate for response
        "qr_data_matches_declared": qr_data_matches_declared,
        "suspected_digital_fake": suspected_digital_fake,
        "font_consistency_score": round(font_consistency_score, 3),
        "forensics_score": round(score, 3),
        "forensics_flags": forensics_flags,
        "doc_type": doc_type,
    }


# ── End Document Forensics ──────────────────────────────────────

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


def _extract_face_crop(image_b64: str) -> str | None:
    """
    Extract likely portrait area from Aadhaar using local face detection.
    Returns a data URL (base64 JPEG) or None.
    """
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return None

    try:
        image_bytes = base64.b64decode(image_b64)
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            return None

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(30, 30),
        )
        if len(faces) == 0:
            return None

        x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
        pad = int(max(w, h) * 0.25)
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(image.shape[1], x + w + pad)
        y2 = min(image.shape[0], y + h + pad)
        crop = image[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        ok, enc = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ok:
            return None
        out_b64 = base64.b64encode(enc.tobytes()).decode("ascii")
        return f"data:image/jpeg;base64,{out_b64}"
    except Exception:
        return None


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


def _norm_name(s: str | None) -> str:
    t = _norm_text(s)
    if not t:
        return ""
    t = re.sub(r"[^A-Z\s]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    # Remove common honorifics and noise tokens from OCR.
    stop_tokens = {"MR", "MRS", "MS", "SHRI", "SMT", "KUMARI"}
    tokens = [tok for tok in t.split(" ") if tok and tok not in stop_tokens]
    return " ".join(tokens)


def _name_consistent(values: list[str]) -> bool:
    names = [_norm_name(v) for v in values if _norm_name(v)]
    if len(names) < 2:
        return False
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            if a == b:
                return True
            ratio = SequenceMatcher(None, a, b).ratio()
            # OCR-safe fuzzy threshold.
            if ratio >= 0.74:
                return True
            # Token overlap fallback for reordered/partial names.
            ta = set(a.split())
            tb = set(b.split())
            if ta and tb and len(ta.intersection(tb)) >= max(1, min(len(ta), len(tb)) - 1):
                return True
    return False


def _norm_city(s: str | None) -> str:
    t = _norm_text(s)
    t = t.replace(" SUBDISTRICT", "")
    t = t.replace(" DISTRICT", "")
    t = t.replace(" TALUKA", "")
    t = t.replace(" TEHSIL", "")
    return re.sub(r"[^A-Z]", "", t)


def _city_match_loose(proof_city: str | None, geo_city: str | None) -> bool | None:
    if not proof_city or not geo_city:
        return None
    p = _norm_city(proof_city)
    g = _norm_city(geo_city)
    if not p or not g:
        return None
    if p == g:
        return True
    if p in g or g in p:
        return True
    ratio = SequenceMatcher(None, p, g).ratio()
    if ratio >= 0.72:
        return True
    # If reverse geocoder returns locality-level label (e.g., subdistrict), don't hard-fail.
    raw_geo = _norm_text(geo_city)
    if "SUBDISTRICT" in raw_geo or "TALUKA" in raw_geo or "TEHSIL" in raw_geo:
        return None
    return False


def _reverse_geocode_city(latitude: float | None, longitude: float | None) -> str | None:
    if latitude is None or longitude is None:
        return None
    try:
        with httpx.Client(timeout=6.0) as client_http:
            res = client_http.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "format": "jsonv2",
                    "lat": latitude,
                    "lon": longitude,
                    "zoom": 10,
                    "addressdetails": 1,
                },
                headers={"User-Agent": "vantage-ai-kyc/1.0"},
            )
        if not res.is_success:
            return None
        address = (res.json() or {}).get("address") or {}
        return (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("county")
            or None
        )
    except Exception:
        return None


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


def verify_kyc_documents(
    aadhaar_b64: str,
    pan_b64: str,
    selfie_b64: str | None = None,
) -> dict:
    """Verify KYC identity from Aadhaar + PAN (+ optional selfie) before loan document stage."""
    prompt = """You are a strict KYC OCR checker.
You will get 2 images in this exact order:
1) Aadhaar
2) PAN

TASK:
1) Extract name, dob, gender from both docs when visible.
2) Extract aadhaar_number and pan_number.
3) Return strict JSON only.

JSON schema:
{
  "aadhaar": {"name": "...", "dob": "...", "gender": "...", "aadhaar_number": "..."},
  "pan": {"name": "...", "dob": "...", "gender": "...", "pan_number": "..."}
}
Use null for unknown fields."""

    aadhaar_b64 = _clean_b64(aadhaar_b64)
    pan_b64 = _clean_b64(pan_b64)
    selfie_b64 = _clean_b64(selfie_b64) if selfie_b64 else None
    aadhaar_photo_base64 = _extract_face_crop(aadhaar_b64)
    pan_photo_base64 = _extract_face_crop(pan_b64)

    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{aadhaar_b64}"}},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{pan_b64}"}},
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

        name_match = _name_consistent([
            _norm_text(aadhaar.get("name")),
            _norm_text(pan.get("name")),
        ])
        dob_match = _field_consistent([
            _norm_dob(aadhaar.get("dob")),
            _norm_dob(pan.get("dob")),
        ])
        gender_match = _field_consistent([
            _norm_gender(aadhaar.get("gender")),
            _norm_gender(pan.get("gender")),
        ])

        aadhaar_number_valid = _is_valid_aadhaar(aadhaar.get("aadhaar_number"))
        pan_number_valid = _is_valid_pan(pan.get("pan_number"))

        selfie_match_score: float | None = None
        selfie_match: bool | None = None
        face_scores: list[float] = []
        face_verified = False
        if selfie_b64 and aadhaar_photo_base64:
            try:
                from deepface import DeepFace  # type: ignore

                compare = DeepFace.verify(
                    img1_path=aadhaar_photo_base64,
                    img2_path=f"data:image/jpeg;base64,{selfie_b64}",
                    enforce_detection=False,
                )
                distance = compare.get("distance")
                if isinstance(distance, (int, float)):
                    score = max(0.0, min(1.0, round(1.0 - float(distance), 3)))
                    face_scores.append(score)
                    face_verified = face_verified or bool(compare.get("verified"))
            except Exception:
                pass

        if selfie_b64 and pan_photo_base64:
            try:
                from deepface import DeepFace  # type: ignore

                compare = DeepFace.verify(
                    img1_path=pan_photo_base64,
                    img2_path=f"data:image/jpeg;base64,{selfie_b64}",
                    enforce_detection=False,
                )
                distance = compare.get("distance")
                if isinstance(distance, (int, float)):
                    score = max(0.0, min(1.0, round(1.0 - float(distance), 3)))
                    face_scores.append(score)
                    face_verified = face_verified or bool(compare.get("verified"))
            except Exception:
                pass

        if face_scores:
            selfie_match_score = max(face_scores)
            # Lowered threshold from 0.55 to 0.40 to handle real-world variations:
            # - Different lighting (document photo vs. video call)
            # - Different angles and expressions
            # - Camera quality differences
            # DeepFace "verified" can be strict in real webcam lighting; use score fallback.
            selfie_match = face_verified or selfie_match_score >= 0.40
        elif selfie_b64:
            selfie_match_score = None
            selfie_match = None

        hard_fail = [
            not aadhaar_number_valid,
            not pan_number_valid,
            not dob_match,
            not gender_match,
            (
                selfie_b64 is not None
                and selfie_match is False
                and (selfie_match_score is not None and selfie_match_score < 0.25)
            ),
        ]
        verified = not any(hard_fail)

        issues = []
        if not aadhaar_number_valid:
            issues.append("invalid Aadhaar number")
        if not pan_number_valid:
            issues.append("invalid PAN number")
        if not dob_match:
            issues.append("DOB mismatch")
        if not gender_match:
            issues.append("gender mismatch")
        if selfie_b64 is not None and selfie_match is False:
            if selfie_match_score is not None and selfie_match_score < 0.25:
                issues.append("selfie does not match document photo")
            else:
                issues.append("selfie match borderline (manual review advised)")
        elif selfie_b64 is not None and selfie_match is None:
            issues.append("selfie face check unavailable (manual review advised)")
        if not name_match:
            issues.append("name mismatch (warning)")

        reason = "KYC documents verified." if verified else (", ".join(issues) or "KYC verification failed")

        return {
            "kyc_status": "VERIFIED" if verified else "FAILED",
            "reason": reason,
            "name_match": name_match,
            "dob_match": dob_match,
            "gender_match": gender_match,
            "aadhaar_number_valid": aadhaar_number_valid,
            "pan_number_valid": pan_number_valid,
            "selfie_match_score": selfie_match_score,
            "selfie_match": selfie_match,
            "aadhaar_photo_base64": aadhaar_photo_base64,
            "extracted": {
                "aadhaar": aadhaar,
                "pan": pan,
            },
        }
    except Exception as e:
        msg = str(e)
        return {
            "kyc_status": "FAILED",
            "reason": f"KYC verification failed: {msg}",
            "name_match": False,
            "dob_match": False,
            "gender_match": False,
            "aadhaar_number_valid": False,
            "pan_number_valid": False,
            "selfie_match_score": None,
            "selfie_match": None,
            "aadhaar_photo_base64": None,
            "extracted": {},
        }


def verify_address_match(
    aadhaar_b64: str,
    pan_b64: str,
    proof_b64: str,
    selfie_b64: str | None = None,
    required_documents: list[str] | None = None,
    uploaded_documents: list[str] | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict:
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
5) Note whether the PAN card itself visibly carries an address.
6) Return strict JSON only.

JSON schema:
{
  "aadhaar": {"name": "...", "dob": "...", "gender": "...", "blood_group": "...", "aadhaar_number": "...", "address": "..."},
    "pan": {"name": "...", "dob": "...", "gender": "...", "pan_number": "...", "address": "...", "has_address": false},
  "address_proof": {"name": "...", "dob": "...", "gender": "...", "blood_group": "...", "address": "...", "city": "..."},
  "address_match": true,
  "address_reason": "short reason"
}
Use null for unknown fields."""

    aadhaar_b64 = _clean_b64(aadhaar_b64)
    pan_b64 = _clean_b64(pan_b64)
    proof_b64 = _clean_b64(proof_b64)
    selfie_b64 = _clean_b64(selfie_b64) if selfie_b64 else None
    aadhaar_photo_base64 = _extract_face_crop(aadhaar_b64)
    pan_photo_base64 = _extract_face_crop(pan_b64)

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

        name_match = _name_consistent([
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
        pan_has_address = bool(pan.get("has_address")) or bool(_norm_text(pan.get("address")))

        selfie_match_score: float | None = None
        selfie_match: bool | None = None
        if selfie_b64 and aadhaar_photo_base64:
            try:
                from deepface import DeepFace  # type: ignore

                compare = DeepFace.verify(
                    img1_path=aadhaar_photo_base64,
                    img2_path=f"data:image/jpeg;base64,{selfie_b64}",
                    enforce_detection=False,
                )
                distance = compare.get("distance")
                if isinstance(distance, (int, float)):
                    selfie_match_score = max(0.0, min(1.0, round(1.0 - float(distance), 3)))
                    # Use threshold 0.40 for consistency with other checks
                    selfie_match = bool(compare.get("verified")) or selfie_match_score >= 0.40
            except Exception:
                selfie_match_score = None
                selfie_match = None

        if selfie_match_score is None and selfie_b64 and pan_photo_base64:
            try:
                from deepface import DeepFace  # type: ignore

                compare = DeepFace.verify(
                    img1_path=pan_photo_base64,
                    img2_path=f"data:image/jpeg;base64,{selfie_b64}",
                    enforce_detection=False,
                )
                distance = compare.get("distance")
                if isinstance(distance, (int, float)):
                    selfie_match_score = max(0.0, min(1.0, round(1.0 - float(distance), 3)))
                    # Use threshold 0.40 for consistency with other checks
                    selfie_match = bool(compare.get("verified")) or selfie_match_score >= 0.40
            except Exception:
                selfie_match_score = None
                selfie_match = None

        address_match = bool(data.get("address_match"))
        address_reason = str(data.get("address_reason") or "").strip() or "Address match status unavailable."
        proof_city = address_proof.get("city")
        geo_city = _reverse_geocode_city(latitude, longitude)
        city_match = _city_match_loose(proof_city, geo_city)

        overall_ok = all([
            address_match,
            dob_match,
            gender_match,
            aadhaar_number_valid,
            pan_number_valid,
            (not selfie_b64) or selfie_match is True,
        ])
        failed_checks = []
        warning_checks = []
        if not address_match:
            failed_checks.append("address mismatch")
        if not name_match:
            warning_checks.append("name mismatch")
        if not dob_match:
            failed_checks.append("dob mismatch")
        if not gender_match:
            failed_checks.append("gender mismatch")
        if not aadhaar_number_valid:
            failed_checks.append("invalid Aadhaar number")
        if not pan_number_valid:
            failed_checks.append("invalid PAN number")
        if city_match is False:
            warning_checks.append("current location city does not match address proof city")
        if selfie_b64 and selfie_match is not True:
            failed_checks.append("selfie does not match document photo")

        reason = "All document checks passed."
        if failed_checks:
            reason = f"{address_reason} Additional issues: {', '.join(failed_checks)}."
        elif warning_checks:
            reason = f"{address_reason} Warning: {', '.join(warning_checks)}."

        policy_required_documents = ["Aadhaar card", "PAN card", "Live selfie capture"]
        if not pan_has_address:
            policy_required_documents.append("Address proof or utility bill")

        required_keys = {x.strip().lower() for x in (required_documents or []) if isinstance(x, str) and x.strip()}
        uploaded_keys = {x.strip().lower() for x in (uploaded_documents or []) if isinstance(x, str) and x.strip()}
        missing_required_documents = sorted(required_keys - uploaded_keys)
        documents_complete = len(missing_required_documents) == 0

        if not documents_complete:
            failed_checks.append(
                "missing required documents: " + ", ".join(missing_required_documents)
            )
            overall_ok = False

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
            "proof_city": proof_city,
            "geo_city": geo_city,
            "city_match": city_match,
            "aadhaar_photo_base64": aadhaar_photo_base64,
            "pan_photo_base64": pan_photo_base64,
            "selfie_match_score": selfie_match_score,
            "selfie_match": selfie_match,
            "pan_has_address": pan_has_address,
            "required_documents": policy_required_documents,
            "documents_complete": documents_complete,
            "missing_required_documents": missing_required_documents,
            "extracted": {
                "aadhaar": aadhaar,
                "pan": pan,
                "address_proof": address_proof,
                "address_match": address_match,
                "address_reason": address_reason,
                "pan_has_address": pan_has_address,
                "required_documents": sorted(required_keys),
                "uploaded_documents": sorted(uploaded_keys),
                "geo": {
                    "latitude": latitude,
                    "longitude": longitude,
                    "geo_city": geo_city,
                },
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
            "proof_city": None,
            "geo_city": None,
            "city_match": None,
            "aadhaar_photo_base64": None,
            "pan_photo_base64": None,
            "selfie_match_score": None,
            "selfie_match": None,
            "pan_has_address": None,
            "required_documents": [],
            "documents_complete": False,
            "missing_required_documents": [],
            "extracted": {},
        }
