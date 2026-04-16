"""AgentState — Unified state object that flows between all agents.

Design decisions:
- Pydantic v2 BaseModel for JSON serialization + FastAPI compatibility.
- Every sub-model is Optional at the top level so the state can be
  incrementally populated as the customer progresses through phases.
- audit_trail is append-only; agents MUST NOT mutate earlier entries.
- retry_requests drives the agentic re-upload loop in DocumentAgent.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────

class Phase(str, Enum):
    """Loan origination phases — maps 1-to-1 with frontend UI states."""
    INTERVIEW = "interview"
    KYC = "kyc"
    DOCUMENT = "document"
    DECISION = "decision"
    COMPLETE = "complete"
    DOCUMENT_REUPLOAD = "document_reupload"  # Agentic retry sub-phase
    MANUAL_REVIEW = "manual_review"          # Escalation when retries exhausted


class UserAction(str, Enum):
    """Actions the frontend can send to drive the orchestrator forward."""
    START_INTERVIEW = "start_interview"
    SUBMIT_INTERVIEW = "submit_interview"
    SUBMIT_KYC = "submit_kyc"
    SUBMIT_DOCUMENTS = "submit_documents"
    REUPLOAD_DOCUMENT = "reupload_document"
    REQUEST_DECISION = "request_decision"
    RESUME = "resume"  # Generic resume after interruption


# ── Sub-models ───────────────────────────────────────────────────

class CustomerProfile(BaseModel):
    """Structured customer data collected during the interview phase."""
    name: str = ""
    employment_type: str = ""           # salaried | self-employed | professional
    monthly_income: float = 0.0
    loan_type: str = "personal"
    requested_loan_amount: float = 0.0
    declared_age: int = 0
    consent: bool = False               # V-CIP verbal consent flag
    consent_text: str = ""              # Raw transcript of consent response
    interview_notes: str = ""
    eligible_amount: float = 0.0        # Computed pre-approval amount


class KYCStatus(BaseModel):
    """KYC verification state — populated by KYCAgent."""
    status: str = "PENDING"             # PENDING | VERIFIED | FAILED
    aadhaar_number: str = ""
    aadhaar_valid: bool = False
    aadhaar_checksum_valid: bool = False
    pan_number: str = ""
    pan_valid: bool = False
    selfie_captured: bool = False
    face_match_score: float = 0.0
    sanctions_clear: bool = False
    risk_flag: str = "LOW_RISK"


class DocumentResults(BaseModel):
    """Document verification results — populated by DocumentAgent."""
    status: str = "PENDING"             # PENDING | VERIFIED | FAILED | REUPLOAD_REQUIRED
    ocr_results: dict[str, Any] = Field(default_factory=dict)
    cross_validation: dict[str, Any] = Field(default_factory=dict)
    name_match: bool = False
    dob_match: bool = False
    gender_match: bool = False
    address_match: bool = False
    aadhaar_masked: bool = False        # RBI Aadhaar masking compliance
    geo_match: Optional[bool] = None    # V-CIP geo-tagging result
    proof_city: Optional[str] = None
    geo_city: Optional[str] = None
    failed_fields: list[str] = Field(default_factory=list)


class RiskAssessment(BaseModel):
    """Risk assessment — populated by DecisionAgent."""
    bureau_score: int = 0
    bureau_band: str = ""
    risk_band: str = "MEDIUM"
    risk_score: int = 50
    propensity_score: float = 0.5
    propensity_band: str = "MEDIUM"
    fraud_flags: list[dict[str, Any]] = Field(default_factory=list)
    eligible: bool = False
    reason: str = ""


class OfferDetails(BaseModel):
    """Loan offer — populated by DecisionAgent."""
    status: str = "PENDING"             # PENDING | PRE-APPROVED | NEEDS_REVIEW | DECLINED
    approved_amount: float = 0.0
    interest_rate: float = 0.0
    tenure_options: list[int] = Field(default_factory=list)
    monthly_emi: float = 0.0
    processing_fee: float = 0.0
    rbi_justification: str = ""         # RAG-retrieved regulatory citation
    decision_reasons: list[str] = Field(default_factory=list)


class GeoTag(BaseModel):
    """V-CIP geo-tagging — lat/lng captured from the customer's browser."""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    captured_at: Optional[str] = None


class AuditEntry(BaseModel):
    """Immutable audit record for every agent action.

    RBI V-CIP requires a concurrent audit trail with timestamps.
    Each entry records what agent did what, when, and why.
    """
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    agent: str                          # e.g. "InterviewAgent", "KYCAgent"
    action: str                         # e.g. "calculate_preapproval", "verify_aadhaar_format"
    result: str = ""                    # Summary of the tool's output
    success: bool = True
    error: Optional[str] = None
    regulatory_tag: str = ""            # e.g. "RBI_KYC_2016_S7", "VCIP_CONSENT"
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentError(BaseModel):
    """Structured error from any agent — stored in state.errors."""
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    agent: str
    error_type: str                     # e.g. "TOOL_FAILURE", "RATE_LIMIT", "VALIDATION"
    message: str
    recoverable: bool = True


class RetryRequest(BaseModel):
    """Document re-upload request generated by the agentic retry loop.

    When DocumentAgent's cross_validate_fields detects a mismatch, it adds
    a RetryRequest instead of terminating the session. The orchestrator
    then routes back to the document upload phase with specific guidance.
    """
    document_type: str                  # e.g. "aadhaar", "pan", "address_proof"
    reason: str                         # e.g. "Name mismatch between Aadhaar and PAN"
    retry_count: int = 0               # Incremented each retry; max 3
    max_retries: int = 3
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ── Main AgentState ──────────────────────────────────────────────

class AgentState(BaseModel):
    """Central state object flowing through the entire agent pipeline.

    This is the single source of truth for a loan origination session.
    Every agent reads from and writes to this state. The orchestrator
    serialises it back to the frontend after each step.
    """
    # Session identity
    session_id: str = Field(
        default_factory=lambda: str(uuid.uuid4())
    )

    # Customer data (incrementally populated)
    customer_profile: CustomerProfile = Field(default_factory=CustomerProfile)
    kyc_status: KYCStatus = Field(default_factory=KYCStatus)
    document_results: DocumentResults = Field(default_factory=DocumentResults)
    risk_assessment: RiskAssessment = Field(default_factory=RiskAssessment)
    offer: OfferDetails = Field(default_factory=OfferDetails)

    # V-CIP compliance
    consent_recorded: bool = False
    geo_tag: GeoTag = Field(default_factory=GeoTag)

    # Phase management
    current_phase: Phase = Phase.INTERVIEW
    next_ui_phase: str = "interview"

    # Audit & error tracking (append-only)
    audit_trail: list[AuditEntry] = Field(default_factory=list)
    errors: list[AgentError] = Field(default_factory=list)

    # Agentic retry loop
    retry_requests: list[RetryRequest] = Field(default_factory=list)

    def log_audit(
        self,
        agent: str,
        action: str,
        result: str = "",
        success: bool = True,
        error: str | None = None,
        regulatory_tag: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Append an immutable audit entry. Called by every tool invocation."""
        self.audit_trail.append(AuditEntry(
            agent=agent,
            action=action,
            result=result,
            success=success,
            error=error,
            regulatory_tag=regulatory_tag,
            metadata=metadata or {},
        ))

    def log_error(
        self,
        agent: str,
        error_type: str,
        message: str,
        recoverable: bool = True,
    ) -> None:
        """Record a structured error."""
        self.errors.append(AgentError(
            agent=agent,
            error_type=error_type,
            message=message,
            recoverable=recoverable,
        ))


# ── API Request / Response ───────────────────────────────────────

class OrchestrateRequest(BaseModel):
    """Inbound payload for POST /api/agent/orchestrate.

    The frontend sends the current state (or an empty one to start)
    plus the user_action that triggered this call.
    """
    state: AgentState = Field(default_factory=AgentState)
    user_action: UserAction = UserAction.START_INTERVIEW
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Action-specific data (e.g. interview answers, KYC numbers, document images)"
    )


class OrchestrateResponse(BaseModel):
    """Outbound payload from POST /api/agent/orchestrate.

    Returns the updated state and the next UI phase the frontend
    should render.
    """
    state: AgentState
    next_ui_phase: str
    message: str = ""                   # Human-readable status for the UI
    requires_user_input: bool = True    # False when the system auto-advances
