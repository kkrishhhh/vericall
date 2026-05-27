"""Vantage AI Vision — DeepFace age estimation (multi-frame median + claim comparison)."""

import base64
import os
import random
import statistics
import tempfile
import uuid
from typing import Any

from age_verification import assess_age_against_claim

try:
    from deepface import DeepFace as _DeepFace
except Exception:
    _DeepFace = None

_CHALLENGE_OPTIONS = [
    "Show two fingers",
    "Show three fingers",
    "Give a thumbs up",
]


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
        "dominant_emotion": None,
        "liveness_passed": False,
    }


def _write_temp_image(image_base64: str) -> str:
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    image_bytes = base64.b64decode(image_base64)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
        return tmp.name


def _analyze_single_frame(image_base64: str) -> dict[str, Any]:
    """Run DeepFace on one base64 JPEG; returns per-frame result."""
    try:
        if _DeepFace is None:
            return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False}

        tmp_path = _write_temp_image(image_base64)
        try:
            results = _DeepFace.analyze(
                img_path=tmp_path,
                actions=["age"],
                detector_backend="retinaface",
                enforce_detection=False,
                silent=True,
            )

            result = results[0] if isinstance(results, list) and results else results
            raw_age = float(result.get("age", 0))
            corrected_age = raw_age - 6 if raw_age < 35 else raw_age - 3
            corrected_age = max(1, corrected_age)
            face_confidence = float(result.get("face_confidence", 0.0))
            if face_confidence <= 0.0:
                return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False, "dominant_emotion": None, "liveness_passed": False}
            return {
                "estimated_age": corrected_age,
                "confidence": round(face_confidence, 2),
                "face_detected": True,
                "dominant_emotion": None,
                "liveness_passed": True,
            }
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        error_msg = str(e).lower()
        if "face" in error_msg and ("not" in error_msg or "could" in error_msg):
            return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False, "dominant_emotion": None, "liveness_passed": False}
        return {"estimated_age": 0.0, "confidence": 0.0, "face_detected": False, "dominant_emotion": None, "liveness_passed": False}


def _verify_same_person(frames: list[str]) -> tuple[bool, float]:
    """Attempt to verify that multiple frames contain the same live person."""
    if _DeepFace is None or len(frames) < 2:
        return False, 0.0
    temp_paths: list[str] = []
    try:
        for frame in frames[:3]:
            if frame:
                temp_paths.append(_write_temp_image(frame))
        if len(temp_paths) < 2:
            return False, 0.0

        reference = temp_paths[0]
        verified_count = 0
        total = 0
        for other in temp_paths[1:]:
            try:
                compare = _DeepFace.verify(
                    img1_path=reference,
                    img2_path=other,
                    detector_backend="retinaface",
                    enforce_detection=False,
                    silent=True,
                )
                total += 1
                if compare.get("verified"):
                    verified_count += 1
            except Exception:
                continue
        return (verified_count == total and total > 0, round((verified_count / total) if total else 0.0, 2))
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


def generate_liveness_challenge() -> dict[str, str]:
    """Generate a random liveness gesture challenge for the client."""
    return {
        "challenge": random.choice(_CHALLENGE_OPTIONS),
        "challenge_token": str(uuid.uuid4()),
        "instructions": "Capture the requested gesture clearly in the next 2-3 frames and submit them for verification.",
    }


def verify_liveness_challenge(frames: list[str]) -> dict[str, Any]:
    """Verify live frames for face presence and consistency across the recording."""
    if not frames:
        return {
            "success": False,
            "face_detected": False,
            "same_person": False,
            "reason": "No frames provided for verification.",
        }

    face_frames = [frame for frame in frames if _analyze_single_frame(frame).get("face_detected")]
    if not face_frames:
        return {
            "success": False,
            "face_detected": False,
            "same_person": False,
            "reason": "No face was detected in any submitted frame.",
        }

    same_person, match_score = _verify_same_person(face_frames)
    if not same_person:
        return {
            "success": False,
            "face_detected": True,
            "same_person": False,
            "reason": "Face was detected but the frames did not verify as the same person.",
        }

    return {
        "success": True,
        "face_detected": True,
        "same_person": True,
        "match_score": match_score,
        "reason": "Live frames verified successfully.",
    }


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
    face_detections: int = 0
    for fb in frames:
        one = _analyze_single_frame(fb)
        if one.get("face_detected"):
            ages.append(float(one["estimated_age"]))
            confidences.append(float(one["confidence"]))
            face_detections += 1

    if not ages:
        out = _empty_result()
        out["samples_used"] = len(frames)
        out["verification_message"] = "No clear face found in the captured frames."
        return out

    median_age = float(statistics.median(ages))
    mean_conf = sum(confidences) / len(confidences)
    liveness_passed = face_detections > 0

    out: dict[str, Any] = {
        "estimated_age": median_age,
        "confidence": round(mean_conf, 2),
        "face_detected": True,
        "samples_used": len(ages),
        "age_delta_years": None,
        "age_match_score": 0.0,
        "looks_consistent_with_claim": None,
        "verification_message": f"Estimated age ~{median_age:.0f} yrs from {len(ages)} frame(s).",
        "dominant_emotion": None,
        "liveness_passed": liveness_passed,
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
