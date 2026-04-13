"""Pydantic models for VeriCall API inputs and outputs."""

from pydantic import BaseModel, Field
from typing import Optional


# ── Agent Models ──────────────────────────────────────────────

class AgentRequest(BaseModel):
    transcript: str = Field(..., description="Latest transcript chunk from the customer")
    conversation_history: list[dict] = Field(
        default_factory=list,
        description="List of {role, content} message dicts for conversation context",
    )
    language: str = Field(
        "en",
        description="Language code for agent responses: 'en', 'hi', or 'mr'",
    )


class AgentResponse(BaseModel):
    message: str = Field(..., description="AI agent's next response to the customer")
    done: bool = Field(False, description="True when all data has been collected")
    data: Optional[dict] = Field(None, description="Structured customer data when done=True")


# ── Vision Models ─────────────────────────────────────────────

class FaceAnalysisRequest(BaseModel):
    image: Optional[str] = Field(None, description="Single base64 JPEG (data URL ok)")
    images: Optional[list[str]] = Field(
        None,
        max_length=5,
        description="Multiple frames for median age (more stable than one grab)",
    )
    declared_age: Optional[int] = Field(
        None,
        ge=1,
        le=120,
        description="Customer-stated age — enables face-vs-claim scoring",
    )

    def resolved_frames(self) -> list[str]:
        if self.images:
            return [x for x in self.images if x]
        if self.image:
            return [self.image]
        return []


class FaceAnalysisResponse(BaseModel):
    estimated_age: float = Field(..., description="Estimated age (median if multi-frame)")
    confidence: float = Field(..., description="Face detection confidence ~0–1")
    face_detected: bool = Field(True, description="Whether a face was found")
    samples_used: int = Field(0, description="Frames that produced a face age")
    age_delta_years: Optional[float] = Field(None, description="|estimate − declared| when declared_age sent")
    age_match_score: float = Field(0.0, ge=0.0, le=1.0, description="1.0 = strong match to declared age")
    looks_consistent_with_claim: Optional[bool] = Field(
        None,
        description="True if face appears consistent with claimed age",
    )
    verification_message: str = Field("", description="Human-readable CV age check summary")


# ── Risk Assessment Models ────────────────────────────────────

class CustomerData(BaseModel):
    name: str = ""
    declared_age: int = 0
    income: float = 0
    employment: str = ""
    purpose: str = ""
    consent: bool = False
    estimated_age: Optional[float] = None
    age_confidence: Optional[float] = None
    age_match_score: Optional[float] = Field(
        None,
        description="0–1 visual age vs claim (from /api/analyze-face)",
    )
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class FraudFlag(BaseModel):
    flag: str
    severity: str = "medium"  # low, medium, high
    details: str = ""


class RiskAssessmentRequest(BaseModel):
    customer: CustomerData
    face_analysis: Optional[FaceAnalysisResponse] = None
    location: Optional[dict] = None
    bureau: Optional[dict] = None


class RiskAssessmentResponse(BaseModel):
    risk_band: str = Field(..., description="LOW / MEDIUM / HIGH")
    risk_score: int = Field(0, ge=0, le=100, description="0=best, 100=highest risk")
    fraud_flags: list[FraudFlag] = Field(default_factory=list)
    eligible: bool = True
    reason: str = ""
    decision_reasons: list[str] = Field(default_factory=list, description="Human-readable risk narrative")
    bureau: dict = Field(default_factory=dict, description="Bureau or alternate-credit snapshot")
    propensity: dict = Field(default_factory=dict, description="Repayment/conversion propensity model output")
    explainability: dict = Field(default_factory=dict, description="Decision trace and reason codes")


# ── Loan Offer Models ────────────────────────────────────────

class OfferRequest(BaseModel):
    customer: CustomerData
    risk_band: str = "MEDIUM"
    risk_score: int = Field(50, ge=0, le=100)
    fraud_flags: list[FraudFlag] = Field(default_factory=list)
    bureau: dict = Field(default_factory=dict)
    propensity: dict = Field(default_factory=dict)


class LoanOffer(BaseModel):
    status: str = Field(..., description="PRE-APPROVED / NEEDS_REVIEW / DECLINED")
    loan_amount: float = 0
    tenure_months: int = 0
    interest_rate: float = 0
    monthly_emi: float = 0
    processing_fee: float = 0
    confidence_score: float = 0
    reason_codes: list[str] = Field(default_factory=list)
    verification_summary: dict = Field(default_factory=dict)
    explainability: dict = Field(default_factory=dict)


# ── Daily.co Room ─────────────────────────────────────────────

class RoomResponse(BaseModel):
    room_url: str
    room_name: str
    token: Optional[str] = None


# ── Session audit / logging ───────────────────────────────────

class SessionAuditPayload(BaseModel):
    """Payload from frontend when a call completes — stored as JSONL."""

    schema_version: str = Field("2026-04", description="Versioned audit schema for downstream consumers")
    session_id: Optional[str] = None
    campaign_id: Optional[str] = None
    lead_id: Optional[str] = None
    source_channel: str = Field("video_call", description="Acquisition/source channel")
    phone: Optional[str] = None
    room_url: Optional[str] = None
    transcript_text: str = Field("", description="Full or summarized transcript")
    messages: Optional[list[dict]] = Field(default=None, description="Optional structured chat log")
    extracted: dict = Field(default_factory=dict)
    risk: dict = Field(default_factory=dict)
    bureau: dict = Field(default_factory=dict)
    propensity: dict = Field(default_factory=dict)
    offer: dict = Field(default_factory=dict)
    decision_trace: list[str] = Field(default_factory=list)
    model_versions: dict = Field(default_factory=dict)
    client_started_at: Optional[str] = Field(None, description="ISO timestamp from client if available")


class SessionAuditResponse(BaseModel):
    session_id: str
    ok: bool = True


# ── LLM extraction (messy speech → structured profile) ────────

class ExtractRequest(BaseModel):
    conversation_text: str = Field(..., min_length=1, description="Raw or concatenated user speech")


class ExtractedProfile(BaseModel):
    name: str = ""
    age: int = 0
    income: float = 0
    employment: str = ""
    loan_purpose: str = ""
    consent: bool = False
    extraction_confidence: float = Field(0.0, ge=0.0, le=1.0)
    notes: str = ""


# ── OTP Verification Models ────────────────────────────────────

class SendOTPRequest(BaseModel):
    mobile_number: str = Field(..., description="Mobile number to send the OTP to")

class VerifyOTPRequest(BaseModel):
    mobile_number: str = Field(..., description="Mobile number the OTP was sent to")
    otp: str = Field(..., description="The OTP entered by the user")

# ── Document Verification Models ───────────────────────────────

class VerifyAddressRequest(BaseModel):
    aadhaar_image: str = Field(..., description="Base64 encoded string of the Aadhaar Card image")
    pan_image: str = Field(..., description="Base64 encoded string of the PAN card image")
    address_proof_image: str = Field(..., description="Base64 encoded string of the Address Proof image")

class VerifyAddressResponse(BaseModel):
    aadhaar_address: str = Field(None, description="The formatted Address extracted from Aadhaar Card")
    proof_address: str = Field(None, description="The formatted Address extracted from the Address Proof")
    matches: bool = Field(..., description="True if the addresses semantically match")
    reason: str = Field(..., description="Reasoning for the match or mismatch from the AI OCR model")
    name_match: bool = Field(False, description="True if name is consistent across documents")
    dob_match: bool = Field(False, description="True if DOB is consistent across documents")
    gender_match: bool = Field(False, description="True if gender is consistent across documents")
    aadhaar_number_valid: bool = Field(False, description="True if Aadhaar number passes format/checksum")
    pan_number_valid: bool = Field(False, description="True if PAN number passes format checks")
    blood_group: Optional[str] = Field(None, description="Blood group if present in any document")
    extracted: dict = Field(default_factory=dict, description="Raw extracted fields by document")
