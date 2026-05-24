from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from .config import OTP_PROVIDER

logger = logging.getLogger(__name__)


class OTPProvider(ABC):
    @abstractmethod
    async def send_otp(self, mobile_number: str, otp: str) -> None:
        """Send an OTP to the provided mobile number."""


class NoopOTPProvider(OTPProvider):
    async def send_otp(self, mobile_number: str, otp: str) -> None:
        logger.info("OTP provider disabled for %s; OTP delivery skipped.", mobile_number)


class MockOTPProvider(OTPProvider):
    async def send_otp(self, mobile_number: str, otp: str) -> None:
        logger.info("Mock OTP provider accepted send request for %s.", mobile_number)


def get_otp_provider() -> OTPProvider:
    provider = (OTP_PROVIDER or "noop").strip().lower()
    if provider == "mock":
        return MockOTPProvider()
    return NoopOTPProvider()
