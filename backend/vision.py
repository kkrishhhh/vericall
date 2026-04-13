"""VeriCall Vision — DeepFace age estimation (multi-frame median + claim comparison)."""

import base64
import os
import statistics
import tempfile
from typing import Any

from age_verification import assess_age_against_claim

try:
    from deepface import DeepFace as _DeepFace
except Exception:
    _DeepFace = None


def _empty_result() -> dict[str, Any]:
    return {
        "estimated_age": 0.0,
        "confidence": 0.0,
        "face_detected": False,
        "samples_used": 0,
        "age_delta_years": None,
        "age_match_score": 0.0,
        "looks_consistent_with_claim": None,
        "verification_message": "",
    }


def _analyze_single_frame(image_base64: str) -> dict[str, Any]:
    """Run DeepFace on one base64 JPEG; returns per-frame result."""
    try:
        if _DeepFace is None:
            return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False}

        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        image_bytes = base64.b64decode(image_base64)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            results = _DeepFace.analyze(
                img_path=tmp_path,
                actions=["age"],
                detector_backend="opencv",
                enforce_detection=False,
                silent=True,
            )

            if isinstance(results, list) and len(results) > 0:
                result = results[0]
                raw_age = float(result.get("age", 0))
                # Age correction: DeepFace systematically overestimates young faces
                corrected_age = raw_age - 6 if raw_age < 35 else raw_age - 3
                corrected_age = max(1, corrected_age)  # clamp to at least 1
                face_confidence = float(result.get("face_confidence", 0.85))
                return {
                    "estimated_age": corrected_age,
                    "confidence": round(face_confidence, 2),
                    "face_detected": True,
                }
            return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False}
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        error_msg = str(e).lower()
        if "face" in error_msg and ("not" in error_msg or "could" in error_msg):
            return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False}
        return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False}


def analyze_face(
    image_base64: str | None = None,
    images: list[str] | None = None,
    declared_age: int | None = None,
) -> dict[str, Any]:
    """
    Estimate age from one or more webcam frames (median age when multiple).
    If declared_age is set, adds match score and human-readable verification text.
    """
    frames: list[str] = []
    if images:
        frames = [x for x in images if x and isinstance(x, str)]
    elif image_base64:
        frames = [image_base64]

    if not frames:
        return _empty_result()

    frames = frames[:5]

    ages: list[float] = []
    confidences: list[float] = []
    for fb in frames:
        one = _analyze_single_frame(fb)
        if one.get("face_detected"):
            ages.append(float(one["estimated_age"]))
            confidences.append(float(one["confidence"]))

    if not ages:
        out = _empty_result()
        out["samples_used"] = len(frames)
        out["verification_message"] = "No clear face found in the captured frames."
        return out

    median_age = float(statistics.median(ages))
    mean_conf = sum(confidences) / len(confidences)

    out: dict[str, Any] = {
        "estimated_age": median_age,
        "confidence": round(mean_conf, 2),
        "face_detected": True,
        "samples_used": len(ages),
        "age_delta_years": None,
        "age_match_score": 0.0,
        "looks_consistent_with_claim": None,
        "verification_message": f"Estimated age ~{median_age:.0f} yrs from {len(ages)} frame(s).",
    }

    if declared_age is not None and declared_age > 0:
        check = assess_age_against_claim(
            median_age,
            int(declared_age),
            face_detected=True,
        )
        out["age_delta_years"] = check["age_delta_years"]
        out["age_match_score"] = check["age_match_score"]
        out["looks_consistent_with_claim"] = check["looks_consistent_with_claim"]
        out["verification_message"] = check["verification_message"]

    return out
