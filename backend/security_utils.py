"""PII Hashing Utilities — SHA-256 based hashing for sensitive data.

Ensures phone numbers, Aadhaar numbers, and PAN numbers are NEVER stored
in raw form in the audit database. Only salted SHA-256 hashes are persisted.

DPDPA & RBI Compliance:
- Personal data must be stored in a non-reversible form.
- Verification is possible via hash comparison with the original salt.
"""

import hashlib
import json
import os
import secrets
import threading
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_SALT_REGISTRY = _DATA_DIR / "salt_registry.json"
_lock = threading.Lock()


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def hash_pii(value: str, salt: str | None = None) -> tuple[str, str]:
    """Hash a PII value using SHA-256 with a random salt.

    Args:
        value: The raw PII string (phone, Aadhaar, PAN).
        salt: Optional pre-existing salt. If None, a new 32-byte hex salt is generated.

    Returns:
        (hashed_value, salt) — the hex digest and the salt used.
    """
    if salt is None:
        salt = secrets.token_hex(16)  # 32-char hex string
    normalized = value.strip().upper()
    combined = f"{salt}:{normalized}"
    hashed = hashlib.sha256(combined.encode("utf-8")).hexdigest()
    return hashed, salt


def verify_pii(value: str, stored_hash: str, salt: str) -> bool:
    """Verify a raw PII value against a stored hash + salt.

    Args:
        value: The raw PII string to verify.
        stored_hash: The previously stored SHA-256 hash.
        salt: The salt that was used during hashing.

    Returns:
        True if the value matches the stored hash.
    """
    computed_hash, _ = hash_pii(value, salt=salt)
    return secrets.compare_digest(computed_hash, stored_hash)


def _load_salt_registry() -> dict:
    """Load the salt registry from disk."""
    if not _SALT_REGISTRY.is_file():
        return {}
    try:
        with open(_SALT_REGISTRY, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_salt_registry(registry: dict) -> None:
    """Persist the salt registry to disk."""
    _ensure_dir()
    with open(_SALT_REGISTRY, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)


def register_session_salts(
    session_id: str,
    phone_salt: str | None = None,
    aadhaar_salt: str | None = None,
    pan_salt: str | None = None,
) -> None:
    """Store the salts used for a session's PII hashing.

    This allows future verification of PII without storing the raw values.
    """
    with _lock:
        registry = _load_salt_registry()
        entry = registry.get(session_id, {})
        if phone_salt:
            entry["phone_salt"] = phone_salt
        if aadhaar_salt:
            entry["aadhaar_salt"] = aadhaar_salt
        if pan_salt:
            entry["pan_salt"] = pan_salt
        entry["updated_at"] = __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat()
        registry[session_id] = entry
        _save_salt_registry(registry)


def get_session_salts(session_id: str) -> dict | None:
    """Retrieve stored salts for a session. Returns None if not found."""
    with _lock:
        registry = _load_salt_registry()
        return registry.get(session_id)


def hash_pii_fields(record: dict, session_id: str) -> dict:
    """Hash all PII fields in a session record before storage.

    Replaces raw phone, aadhaar, and PAN values with their hashed equivalents.
    Registers salts in the salt registry for future verification.

    Args:
        record: The session payload dict (will be modified in-place).
        session_id: The session ID for salt registry.

    Returns:
        The modified record with hashed PII fields.
    """
    phone_salt = None
    aadhaar_salt = None
    pan_salt = None

    # Hash phone number at top level
    if record.get("phone"):
        hashed, salt = hash_pii(record["phone"])
        record["phone"] = hashed
        record["phone_hashed"] = True
        phone_salt = salt

    # Hash PII in nested extracted data
    extracted = record.get("extracted") or {}

    # Aadhaar number
    aadhaar_num = extracted.get("aadhaar_number") or ""
    if aadhaar_num and len(aadhaar_num) >= 10:
        hashed, salt = hash_pii(aadhaar_num)
        extracted["aadhaar_number"] = hashed
        extracted["aadhaar_hashed"] = True
        aadhaar_salt = salt

    # PAN number
    pan_num = extracted.get("pan_number") or ""
    if pan_num and len(pan_num) >= 8:
        hashed, salt = hash_pii(pan_num)
        extracted["pan_number"] = hashed
        extracted["pan_hashed"] = True
        pan_salt = salt

    # Also check inside nested document data
    for doc_key in ["aadhaar", "pan", "address_proof"]:
        doc = extracted.get(doc_key) or {}
        if isinstance(doc, dict):
            if doc.get("aadhaar_number") and not doc.get("aadhaar_hashed"):
                hashed, salt = hash_pii(doc["aadhaar_number"])
                doc["aadhaar_number"] = hashed
                doc["aadhaar_hashed"] = True
                if not aadhaar_salt:
                    aadhaar_salt = salt
            if doc.get("pan_number") and not doc.get("pan_hashed"):
                hashed, salt = hash_pii(doc["pan_number"])
                doc["pan_number"] = hashed
                doc["pan_hashed"] = True
                if not pan_salt:
                    pan_salt = salt

    record["extracted"] = extracted

    # Register all salts for this session
    register_session_salts(
        session_id,
        phone_salt=phone_salt,
        aadhaar_salt=aadhaar_salt,
        pan_salt=pan_salt,
    )

    return record
