"""VeriCall Vision — DeepFace age estimation."""

import base64
import tempfile
import os


def analyze_face(image_base64: str) -> dict:
    """
    Analyze a base64-encoded image to estimate age using DeepFace.

    Returns:
        dict with keys: estimated_age (float), confidence (float), face_detected (bool)
    """
    try:
        # Lazy import — DeepFace is heavy and downloads models on first use
        from deepface import DeepFace

        # Decode base64 image and write to temp file
        # Strip data URL prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        image_bytes = base64.b64decode(image_base64)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            # Run DeepFace analysis for age only
            results = DeepFace.analyze(
                img_path=tmp_path,
                actions=["age"],
                enforce_detection=True,
                silent=True,
            )

            # DeepFace returns a list of results (one per face detected)
            if isinstance(results, list) and len(results) > 0:
                result = results[0]
                estimated_age = float(result.get("age", 0))

                # DeepFace doesn't provide a native confidence score for age,
                # so we derive one from the face detection confidence
                face_confidence = float(result.get("face_confidence", 0.85))

                return {
                    "estimated_age": estimated_age,
                    "confidence": round(face_confidence, 2),
                    "face_detected": True,
                }
            else:
                return {
                    "estimated_age": 0,
                    "confidence": 0,
                    "face_detected": False,
                }
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        error_msg = str(e).lower()
        if "face" in error_msg and ("not" in error_msg or "could" in error_msg):
            return {
                "estimated_age": 0,
                "confidence": 0,
                "face_detected": False,
            }
        # For other errors, return a graceful fallback
        return {
            "estimated_age": 0,
            "confidence": 0,
            "face_detected": False,
        }
