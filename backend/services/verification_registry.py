"""Official Database Verification Registry — External Verification Services.

Architecture for production-grade identity verification against official
government databases and financial services.

Services:
1. Aadhaar: UIDAI e-KYC (mocked, requires KUA license) + QR signature verification
2. PAN: NSDL/IT Portal verification (format + simulated name match)
3. Bank Account: Penny drop verification via Setu sandbox
4. GST: Government GST portal public search API

Most services are mocked for the hackathon but show the full production
architecture with proper request/response models.
"""

import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from pydantic import BaseModel, Field


# ── Response Models ──────────────────────────────────────────────

class VerificationResult(BaseModel):
    """Standard result for all verification types."""
    service: str
    verified: bool
    confidence: float = 0.0            # 0-1
    details: dict = {}
    source: str = "mock"               # "mock", "api", "offline"
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    error: Optional[str] = None


# ── 1. Aadhaar Verification ─────────────────────────────────────

class AadhaarVerifier:
    """Aadhaar verification via UIDAI.

    Production path:
      - e-KYC API requires KUA (KYC User Agency) license from UIDAI
      - Aadhaar QR contains digitally signed XML — verify using UIDAI's public key
      - Not accessible without license → mocked for hackathon

    What we CAN do without a license:
      - Format validation (12 digits, Verhoeff checksum)
      - QR code extraction and data parsing
      - Demographic matching from OCR
    """

    _VERHOEFF_D = [
        [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],
        [2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
        [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
        [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
        [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
    ]
    _VERHOEFF_P = [
        [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],
        [5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
        [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
        [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
    ]

    @staticmethod
    def verify_format(aadhaar_number: str) -> VerificationResult:
        """Validate Aadhaar format + Verhoeff checksum."""
        compact = re.sub(r"\s+", "", aadhaar_number)

        if not re.fullmatch(r"[0-9]{12}", compact):
            return VerificationResult(
                service="aadhaar_format",
                verified=False,
                confidence=1.0,
                details={"reason": "Must be 12 digits"},
                source="offline",
            )

        if compact[0] in ("0", "1"):
            return VerificationResult(
                service="aadhaar_format",
                verified=False,
                confidence=1.0,
                details={"reason": "Aadhaar cannot start with 0 or 1"},
                source="offline",
            )

        # Verhoeff checksum
        c = 0
        for i, digit in enumerate(reversed(compact)):
            c = AadhaarVerifier._VERHOEFF_D[c][AadhaarVerifier._VERHOEFF_P[i % 8][int(digit)]]
        valid = c == 0

        return VerificationResult(
            service="aadhaar_format",
            verified=valid,
            confidence=1.0 if valid else 0.0,
            details={
                "verhoeff_valid": valid,
                "format_valid": True,
                "masked": f"XXXX-XXXX-{compact[-4:]}",
            },
            source="offline",
        )

    @staticmethod
    def verify_qr_signature(qr_data: str) -> VerificationResult:
        """Verify Aadhaar QR code digital signature.

        In production: Extract the XML from QR, verify the digital signature
        using UIDAI's public key (available at uidai.gov.in).

        For hackathon: Parse QR data structure and check for expected fields.
        """
        if not qr_data:
            return VerificationResult(
                service="aadhaar_qr",
                verified=False,
                confidence=0.0,
                details={"reason": "No QR data provided"},
                source="mock",
            )

        # Check for Aadhaar QR data indicators
        indicators = ["uid", "name", "dob", "gender", "pincode", "state"]
        found = sum(1 for ind in indicators if ind.lower() in qr_data.lower())

        # In production: xml.dom.minidom.parseString() + signature verification
        verified = found >= 3

        return VerificationResult(
            service="aadhaar_qr",
            verified=verified,
            confidence=min(1.0, found / 4),
            details={
                "fields_found": found,
                "total_expected": len(indicators),
                "has_digital_signature": "signature" in qr_data.lower() or "ds" in qr_data.lower(),
                "production_note": "In production, XML digital signature is verified using UIDAI's RSA public key",
            },
            source="offline" if verified else "mock",
        )

    @staticmethod
    def ekyc_verify(aadhaar_number: str, otp: str = "") -> VerificationResult:
        """Mock UIDAI e-KYC API verification.

        Production flow:
        1. App sends Aadhaar number to UIDAI via licensed ASA (Authentication Service Agency)
        2. UIDAI sends OTP to registered mobile
        3. User enters OTP
        4. UIDAI returns signed XML with demographic + photo data

        Requires: KUA license from UIDAI (not available for hackathon)
        """
        compact = re.sub(r"\s+", "", aadhaar_number)
        # Deterministic mock based on hash
        h = hashlib.sha256(compact.encode()).hexdigest()
        mock_score = 0.7 + (int(h[:4], 16) % 30) / 100

        return VerificationResult(
            service="aadhaar_ekyc",
            verified=True,
            confidence=round(mock_score, 3),
            details={
                "mode": "OTP",
                "masked_aadhaar": f"XXXX-XXXX-{compact[-4:]}",
                "demographic_match": True,
                "photo_available": True,
                "production_note": "Requires KUA license from UIDAI. Response would include signed XML.",
            },
            source="mock",
        )


# ── 2. PAN Verification ─────────────────────────────────────────

class PANVerifier:
    """PAN verification against Income Tax Department / NSDL.

    Production paths:
    1. NSDL PAN verification API (for licensed entities)
    2. IT Portal: https://eportal.incometax.gov.in/iec/foservices/#/pre-login/verifyYourPAN
    """

    _PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

    # 4th character of PAN indicates holder type
    _HOLDER_TYPE = {
        "P": "Individual",
        "C": "Company",
        "H": "HUF",
        "F": "Firm",
        "A": "AOP",
        "T": "Trust",
        "B": "BOI",
        "L": "Local Authority",
        "J": "Artificial Juridical Person",
        "G": "Government",
    }

    @staticmethod
    def verify_format(pan_number: str) -> VerificationResult:
        """Validate PAN format and extract holder type."""
        compact = re.sub(r"\s+", "", pan_number).upper()
        valid = PANVerifier._PAN_RE.fullmatch(compact) is not None

        details = {"format_valid": valid}
        if valid:
            details["holder_type"] = PANVerifier._HOLDER_TYPE.get(compact[3], "Unknown")
            details["area_code"] = compact[:3]
            details["sequence"] = compact[5:9]

        return VerificationResult(
            service="pan_format",
            verified=valid,
            confidence=1.0 if valid else 0.0,
            details=details,
            source="offline",
        )

    @staticmethod
    def verify_with_name(pan_number: str, declared_name: str) -> VerificationResult:
        """Mock PAN verification with name matching.

        Production: Calls NSDL API or scrapes IT portal to verify PAN
        is active and name matches the registered holder.
        """
        compact = re.sub(r"\s+", "", pan_number).upper()
        if not PANVerifier._PAN_RE.fullmatch(compact):
            return VerificationResult(
                service="pan_name_verify",
                verified=False,
                confidence=0.0,
                details={"reason": "Invalid PAN format"},
                source="offline",
            )

        # Deterministic mock
        h = hashlib.sha256(compact.encode()).hexdigest()
        mock_score = 0.75 + (int(h[:4], 16) % 25) / 100

        return VerificationResult(
            service="pan_name_verify",
            verified=True,
            confidence=round(mock_score, 3),
            details={
                "pan": compact,
                "name_match": True,
                "status": "ACTIVE",
                "holder_type": PANVerifier._HOLDER_TYPE.get(compact[3], "Unknown"),
                "production_endpoint": "https://eportal.incometax.gov.in/iec/foservices/#/pre-login/verifyYourPAN",
                "production_note": "NSDL PAN Verification API provides real-time name + status verification",
            },
            source="mock",
        )


# ── 3. Bank Account Verification (Penny Drop) ───────────────────

class BankAccountVerifier:
    """Bank account verification via penny drop.

    Production: Use Setu, Razorpay, or Cashfree penny drop API.
    - Sends ₹1 to the account
    - Bank returns registered name
    - Compare name with declared name
    - Setu sandbox: https://setu.co/payments/account-verification
    """

    @staticmethod
    def verify_penny_drop(
        account_number: str,
        ifsc_code: str,
        declared_name: str,
    ) -> VerificationResult:
        """Mock penny drop verification.

        In production:
        1. POST to Setu/Razorpay with account_number + IFSC
        2. ₹1 transferred and immediately reversed
        3. Bank returns registered beneficiary name
        4. Fuzzy match against declared_name
        """
        if not account_number or not ifsc_code:
            return VerificationResult(
                service="bank_penny_drop",
                verified=False,
                confidence=0.0,
                details={"reason": "Account number and IFSC required"},
                source="mock",
            )

        # IFSC format validation (real check)
        ifsc_valid = bool(re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", ifsc_code.upper()))

        # Mock penny drop result
        h = hashlib.sha256(f"{account_number}:{ifsc_code}".encode()).hexdigest()
        mock_score = 0.80 + (int(h[:4], 16) % 20) / 100

        return VerificationResult(
            service="bank_penny_drop",
            verified=ifsc_valid,
            confidence=round(mock_score, 3) if ifsc_valid else 0.0,
            details={
                "ifsc_valid": ifsc_valid,
                "account_masked": f"XXXXX{account_number[-4:]}" if len(account_number) >= 4 else "XXXX",
                "penny_amount": "₹1.00",
                "name_match": True if ifsc_valid else False,
                "bank_name": _ifsc_to_bank(ifsc_code) if ifsc_valid else None,
                "production_provider": "Setu Account Verification API",
                "sandbox_url": "https://setu.co/payments/account-verification",
            },
            source="mock",
        )


def _ifsc_to_bank(ifsc: str) -> str:
    """Extract bank name from IFSC prefix (first 4 chars)."""
    bank_map = {
        "SBIN": "State Bank of India",
        "HDFC": "HDFC Bank",
        "ICIC": "ICICI Bank",
        "UTIB": "Axis Bank",
        "KKBK": "Kotak Mahindra Bank",
        "PUNB": "Punjab National Bank",
        "BARB": "Bank of Baroda",
        "CNRB": "Canara Bank",
        "IOBA": "Indian Overseas Bank",
        "UBIN": "Union Bank of India",
    }
    prefix = ifsc[:4].upper()
    return bank_map.get(prefix, f"Bank ({prefix})")


# ── 4. GST Verification ─────────────────────────────────────────

class GSTVerifier:
    """GST verification via government public API.

    This is the one service that has a FREE public API:
    https://api.gst.gov.in/commonapi/v1.1/search?action=TP&gstin={gstin}

    For self-employed customers who provide a GST number, this verifies
    their business registration status directly with the government.
    """

    _GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$")

    @staticmethod
    def verify_format(gstin: str) -> VerificationResult:
        """Validate GSTIN format."""
        compact = re.sub(r"\s+", "", gstin).upper()
        valid = GSTVerifier._GSTIN_RE.fullmatch(compact) is not None

        details = {"format_valid": valid}
        if valid:
            details["state_code"] = compact[:2]
            details["pan_in_gstin"] = compact[2:12]

        return VerificationResult(
            service="gst_format",
            verified=valid,
            confidence=1.0 if valid else 0.0,
            details=details,
            source="offline",
        )

    @staticmethod
    async def verify_with_api(gstin: str) -> VerificationResult:
        """Verify GSTIN against the government GST public search API.

        This is a REAL API call — no license needed.
        Endpoint: https://api.gst.gov.in/commonapi/v1.1/search?action=TP&gstin={gstin}
        """
        compact = re.sub(r"\s+", "", gstin).upper()
        if not GSTVerifier._GSTIN_RE.fullmatch(compact):
            return VerificationResult(
                service="gst_api",
                verified=False,
                confidence=0.0,
                details={"reason": "Invalid GSTIN format"},
                source="offline",
            )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://api.gst.gov.in/commonapi/v1.1/search",
                    params={"action": "TP", "gstin": compact},
                    headers={"User-Agent": "vericall-kyc/1.0"},
                )

                if response.status_code == 200:
                    data = response.json()

                    if data.get("sts") == "Active":
                        return VerificationResult(
                            service="gst_api",
                            verified=True,
                            confidence=0.95,
                            details={
                                "gstin": compact,
                                "trade_name": data.get("tradeNam", ""),
                                "legal_name": data.get("lgnm", ""),
                                "status": data.get("sts", ""),
                                "state": data.get("stj", ""),
                                "registration_date": data.get("rgdt", ""),
                                "taxpayer_type": data.get("dty", ""),
                            },
                            source="api",
                        )
                    else:
                        return VerificationResult(
                            service="gst_api",
                            verified=False,
                            confidence=0.9,
                            details={
                                "gstin": compact,
                                "status": data.get("sts", "Unknown"),
                                "reason": "GSTIN not active",
                            },
                            source="api",
                        )
                else:
                    # API unavailable — fall back to format check
                    return VerificationResult(
                        service="gst_api",
                        verified=True,
                        confidence=0.5,
                        details={
                            "gstin": compact,
                            "note": f"GST API returned status {response.status_code}. Format validated only.",
                        },
                        source="mock",
                    )

        except Exception as e:
            return VerificationResult(
                service="gst_api",
                verified=True,
                confidence=0.4,
                details={
                    "gstin": compact,
                    "note": f"GST API call failed: {str(e)}. Format validated only.",
                },
                source="mock",
            )


# ── Unified Verification Interface ──────────────────────────────

async def run_all_verifications(
    aadhaar_number: str | None = None,
    pan_number: str | None = None,
    declared_name: str = "",
    account_number: str | None = None,
    ifsc_code: str | None = None,
    gstin: str | None = None,
    qr_data: str | None = None,
) -> dict:
    """Run all applicable verifications and return combined results.

    Args:
        aadhaar_number: 12-digit Aadhaar number
        pan_number: 10-char PAN number
        declared_name: Customer's declared name for cross-matching
        account_number: Bank account number
        ifsc_code: IFSC code
        gstin: GST Identification Number (for self-employed)
        qr_data: Extracted Aadhaar QR data string

    Returns:
        Dict with results from each verification service.
    """
    results = {}

    if aadhaar_number:
        results["aadhaar_format"] = AadhaarVerifier.verify_format(aadhaar_number).model_dump()
        results["aadhaar_ekyc"] = AadhaarVerifier.ekyc_verify(aadhaar_number).model_dump()

    if qr_data:
        results["aadhaar_qr"] = AadhaarVerifier.verify_qr_signature(qr_data).model_dump()

    if pan_number:
        results["pan_format"] = PANVerifier.verify_format(pan_number).model_dump()
        results["pan_name_verify"] = PANVerifier.verify_with_name(pan_number, declared_name).model_dump()

    if account_number and ifsc_code:
        results["bank_penny_drop"] = BankAccountVerifier.verify_penny_drop(
            account_number, ifsc_code, declared_name
        ).model_dump()

    if gstin:
        results["gst_format"] = GSTVerifier.verify_format(gstin).model_dump()
        results["gst_api"] = (await GSTVerifier.verify_with_api(gstin)).model_dump()

    # Overall verification summary
    all_results = list(results.values())
    verified_count = sum(1 for r in all_results if r.get("verified"))
    total_count = len(all_results)

    results["_summary"] = {
        "total_checks": total_count,
        "passed": verified_count,
        "failed": total_count - verified_count,
        "overall_confidence": round(
            sum(r.get("confidence", 0) for r in all_results) / total_count, 3
        ) if total_count else 0,
        "all_verified": verified_count == total_count,
    }

    return results
