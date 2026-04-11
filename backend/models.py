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


class AgentResponse(BaseModel):
    message: str = Field(..., description="AI agent's next response to the customer")
    done: bool = Field(False, description="True when all data has been collected")
    data: Optional[dict] = Field(None, description="Structured customer data when done=True")


# ── Vision Models ─────────────────────────────────────────────

class FaceAnalysisRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded JPEG image from webcam")


class FaceAnalysisResponse(BaseModel):
    estimated_age: float = Field(..., description="Estimated age from DeepFace")
    confidence: float = Field(..., description="Confidence score 0-1")
    face_detected: bool = Field(True, description="Whether a face was found in the image")


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


class RiskAssessmentResponse(BaseModel):
    risk_band: str = Field(..., description="LOW / MEDIUM / HIGH")
    fraud_flags: list[FraudFlag] = Field(default_factory=list)
    eligible: bool = True
    reason: str = ""


# ── Loan Offer Models ────────────────────────────────────────

class OfferRequest(BaseModel):
    customer: CustomerData
    risk_band: str = "MEDIUM"
    fraud_flags: list[FraudFlag] = Field(default_factory=list)


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


# ── Daily.co Room ─────────────────────────────────────────────

class RoomResponse(BaseModel):
    room_url: str
    room_name: str
    token: Optional[str] = None
