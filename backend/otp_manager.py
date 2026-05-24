from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Dict, List

from .config import (
    DEV_EXPOSE_KYC_OTP,
    OTP_LOCKOUT_MINUTES,
    OTP_MAX_FAILED_ATTEMPTS,
    OTP_MAX_SENDS_PER_WINDOW,
    OTP_SEND_WINDOW_MINUTES,
    OTP_VALIDITY_MINUTES,
)
from .otp_provider import get_otp_provider

logger = logging.getLogger(__name__)


class OTPError(Exception):
    pass


class OTPRequestRateLimited(OTPError):
    pass


class OTPInvalid(OTPError):
    pass


class OTPExpired(OTPError):
    pass


class OTPBlocked(OTPError):
    pass


@dataclass
class OTPEntry:
    otp: str
    expires_at: float
    send_timestamps: List[float] = field(default_factory=list)
    failed_attempts: int = 0
    lockout_until: float = 0.0

    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    def is_locked(self) -> bool:
        return time.time() < self.lockout_until


_otp_store: Dict[str, OTPEntry] = {}
_provider = get_otp_provider()


def normalize_mobile(mobile_number: str) -> str:
    digits = "".join(ch for ch in mobile_number if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if mobile_number.startswith("+"):
        return mobile_number
    return f"+{digits}" if digits else mobile_number


async def request_otp(mobile_number: str) -> str | None:
    normalized = normalize_mobile(mobile_number)
    now = time.time()
    record = _otp_store.get(normalized)

    if record and record.is_expired():
        _otp_store.pop(normalized, None)
        record = None

    send_window_seconds = OTP_SEND_WINDOW_MINUTES * 60
    if record:
        recent_sends = [ts for ts in record.send_timestamps if ts >= now - send_window_seconds]
        if len(recent_sends) >= OTP_MAX_SENDS_PER_WINDOW:
            raise OTPRequestRateLimited(
                "Too many OTP requests for this number. Try again later."
            )

    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = now + (OTP_VALIDITY_MINUTES * 60)
    entry = OTPEntry(otp=otp, expires_at=expires_at, send_timestamps=[now])
    _otp_store[normalized] = entry

    try:
        await _provider.send_otp(normalized, otp)
    except Exception as exc:
        logger.exception("Failed to send OTP to %s", normalized)
        _otp_store.pop(normalized, None)
        raise

    if DEV_EXPOSE_KYC_OTP:
        return otp
    return None


async def verify_otp(mobile_number: str, submitted_otp: str) -> None:
    normalized = normalize_mobile(mobile_number)
    record = _otp_store.get(normalized)
    if not record:
        raise OTPInvalid("No OTP requested for this number")

    if record.is_expired():
        _otp_store.pop(normalized, None)
        raise OTPExpired("OTP expired")

    if record.is_locked():
        raise OTPBlocked("OTP attempts blocked due to repeated failures. Try again later.")

    if record.otp != submitted_otp:
        record.failed_attempts += 1
        if record.failed_attempts >= OTP_MAX_FAILED_ATTEMPTS:
            record.lockout_until = time.time() + (OTP_LOCKOUT_MINUTES * 60)
            record.failed_attempts = 0
            raise OTPBlocked("Too many invalid OTP attempts. Try again later.")
        raise OTPInvalid("Invalid OTP")

    _otp_store.pop(normalized, None)


def cleanup_expired_otps() -> None:
    now = time.time()
    expired = [key for key, entry in _otp_store.items() if entry.is_expired()]
    for key in expired:
        _otp_store.pop(key, None)
