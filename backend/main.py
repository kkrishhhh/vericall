"""Vantage AI — FastAPI Backend Entry Point."""

import os
import time
import logging
import random
import secrets
import asyncio
import smtplib
import ssl
import httpx
from fastapi import FastAPI, HTTPException, Depends
from email.message import EmailMessage
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Multi-agent orchestration layer
from agents.orchestrator import OrchestratorAgent
from agents.state import OrchestrateRequest, OrchestrateResponse

from models import (
    AgentRequest, AgentResponse,
    FaceAnalysisRequest, FaceAnalysisResponse,
    RiskAssessmentRequest, RiskAssessmentResponse,
    OfferRequest, LoanOffer,
    RoomResponse, CustomerData,
    SessionAuditPayload, SessionAuditResponse,
    ExtractRequest, ExtractedProfile,
    SendOTPRequest, VerifyOTPRequest,
    VideoKycRequestCreate, VideoKycOtpVerifyRequest,
    VerifyAddressRequest, VerifyAddressResponse,
    InterviewProfileRequest, InterviewPreapprovalResponse,
    KycVerifyRequest, KycVerifyResponse,
    KycDocumentsVerifyRequest, KycDocumentsVerifyResponse,
    KycReviewPdfRequest,
    DecisionRequest, DecisionResponse,
)
from agent import run_agent
from vision import analyze_face
from fraud import assess_risk
from offer import generate_offer
from session_log import append_session_record, read_recent_sessions, read_session_by_id
from extraction import extract_profile_from_text
from services.document_match import verify_address_match, verify_kyc_documents
from services.document_builder import build_document_pack
from services.document_templates import render_application_form_html
from services.document_pdf import render_application_form_pdf, render_kyc_review_pdf
from services.journey_core import (
    compute_preapproval,
    verify_kyc,
    evaluate_decision,
)
from services.consent_manager import (
    ConsentRecord, RecordConsentRequest,
    store_consent, get_consent_by_session,
)
from services.human_review_queue import (
    HumanReviewItem, EscalateRequest, ResolveRequest,
    escalate_to_review, get_review_queue, resolve_review,
    check_and_escalate, ESCALATION_TRIGGERS,
)
from rbac import (
    Role, LoginRequest, LoginResponse,
    authenticate_user, require_role, get_current_user,
)
from services.analytics import (
    get_overview_stats, get_fraud_stats,
    get_regional_breakdown, get_ai_performance_metrics,
)


# Load env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(
    title="Vantage AI API",
    description="Agentic AI Video Call Onboarding System — Backend",
    version="1.0.0",
)

# CORS — allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "Vantage AI API", "version": "1.0.0"}


# ── 1. Agent Endpoint ────────────────────────────────────────

@app.post("/api/agent", response_model=AgentResponse)
async def agent_endpoint(req: AgentRequest):
    """Process transcript through the Groq LLM agent."""
    try:
        result = run_agent(req.transcript, req.conversation_history, req.language)
        return AgentResponse(
            message=result["message"],
            done=result["done"],
            data=result.get("data"),
        )
    except Exception as e:
        if "AGENT_RATE_LIMIT" in str(e):
            raise HTTPException(
                status_code=429,
                detail="Rate limit reached for AI model. Please retry in a few moments.",
            ) from e
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


# ── 2. Face Analysis Endpoint ────────────────────────────────

@app.post("/api/analyze-face", response_model=FaceAnalysisResponse)
async def face_analysis_endpoint(req: FaceAnalysisRequest):
    """Analyze face frame(s) for age; optional declared_age enables face-vs-claim scoring."""
    frames = req.resolved_frames()
    if not frames:
        raise HTTPException(
            status_code=400,
            detail="Provide `image` or `images` (base64 JPEG).",
        )
    try:
        result = analyze_face(
            image_base64=None,
            images=frames,
            declared_age=req.declared_age,
        )
        return FaceAnalysisResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision error: {str(e)}")


# ── 3. Risk Assessment Endpoint ──────────────────────────────

@app.post("/api/assess-risk", response_model=RiskAssessmentResponse)
async def risk_assessment_endpoint(req: RiskAssessmentRequest):
    """Assess fraud risk for a customer."""
    try:
        result = assess_risk(
            customer=req.customer,
            face_analysis=req.face_analysis,
            location=req.location,
            bureau=req.bureau,
        )
        return RiskAssessmentResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk assessment error: {str(e)}")


# ── 4. Offer Generation Endpoint ─────────────────────────────

@app.post("/api/generate-offer", response_model=LoanOffer)
async def offer_endpoint(req: OfferRequest):
    """Generate a personalized loan offer."""
    try:
        result = generate_offer(
            customer=req.customer,
            risk_band=req.risk_band,
            risk_score=req.risk_score,
            fraud_flags=[f.model_dump() if hasattr(f, 'model_dump') else f for f in req.fraud_flags],
            bureau=req.bureau,
            propensity=req.propensity,
        )
        return LoanOffer(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Offer generation error: {str(e)}")


# ── 5. Daily.co Room Creation ────────────────────────────────

@app.post("/api/create-room", response_model=RoomResponse)
async def create_room():
    """Create a new Daily.co video call room."""
    daily_key = os.environ.get("DAILY_API_KEY")
    if not daily_key:
        raise HTTPException(status_code=500, detail="Daily.co API key not configured")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.daily.co/v1/rooms",
                headers={"Authorization": f"Bearer {daily_key}"},
                json={
                    "properties": {
                        "exp": int(time.time()) + 3600,  # 1 hour expiry
                        "enable_chat": True,
                        "enable_knocking": False,
                        "start_video_off": False,
                        "start_audio_off": False,
                    }
                },
            )
            response.raise_for_status()
            data = response.json()

            return RoomResponse(
                room_url=data.get("url", ""),
                room_name=data.get("name", ""),
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Daily.co API error: {str(e)}")


# ── 6. Deepgram Token Proxy ──────────────────────────────────

@app.get("/api/deepgram-token")
async def deepgram_token():
    """Return the Deepgram API key for browser STT (used in WebSocket subprotocol, not query string)."""
    key = (os.environ.get("DEEPGRAM_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="Deepgram API key not configured")
    return {"token": key}


# ── 7. Session audit log (JSONL) ───────────────────────────────

@app.post("/api/log-session", response_model=SessionAuditResponse)
async def log_session_endpoint(payload: SessionAuditPayload):
    """Persist transcript summary, extracted data, risk, and offer for demos."""
    try:
        sid = append_session_record(payload.model_dump(exclude_none=True))
        return SessionAuditResponse(session_id=sid, ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logging failed: {str(e)}") from e


@app.get("/api/audit/recent")
async def audit_recent(limit: int = 20):
    """Recent sessions for dashboard (newest first)."""
    lim = max(1, min(limit, 100))
    return {"sessions": read_recent_sessions(lim)}


@app.get("/api/audit/session/{session_id}")
async def audit_session_by_id(session_id: str):
    """Fetch a single session record by ID."""
    session = read_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ── 8. Auto-filled document generation ──────────────────────

@app.get("/api/documents/latest")
async def documents_latest():
    """Build auto-filled document payloads from the latest session."""
    sessions = read_recent_sessions(1)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found to generate documents")
    return build_document_pack(sessions[0])


@app.get("/api/documents/{session_id}")
async def documents_by_session(session_id: str):
    """Build auto-filled document payloads from a specific session_id."""
    row = read_session_by_id(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return build_document_pack(row)


def _application_doc_from_pack(pack: dict) -> dict:
    for doc in pack.get("documents") or []:
        if doc.get("document_type") == "loan_application_form":
            return doc
    raise HTTPException(status_code=500, detail="Loan application form not found in document pack")


@app.get("/api/documents/latest/application/html", response_class=HTMLResponse)
async def latest_application_form_html(download: bool = False):
    """Render a print-friendly HTML loan application from latest session."""
    sessions = read_recent_sessions(1)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found to generate documents")

    pack = build_document_pack(sessions[0])
    app_doc = _application_doc_from_pack(pack)
    html = render_application_form_html(app_doc)

    headers = {}
    if download:
        sid = sessions[0].get("session_id", "latest")
        headers["Content-Disposition"] = f'attachment; filename="application-{sid}.html"'
    return HTMLResponse(content=html, headers=headers)


@app.get("/api/documents/{session_id}/application/html", response_class=HTMLResponse)
async def session_application_form_html(session_id: str, download: bool = False):
    """Render a print-friendly HTML loan application from a specific session."""
    row = read_session_by_id(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    pack = build_document_pack(row)
    app_doc = _application_doc_from_pack(pack)
    html = render_application_form_html(app_doc)

    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="application-{session_id}.html"'
    return HTMLResponse(content=html, headers=headers)


@app.get("/api/documents/latest/application/pdf")
async def latest_application_form_pdf():
    """Generate a downloadable PDF loan application from latest session."""
    sessions = read_recent_sessions(1)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found to generate documents")

    pack = build_document_pack(sessions[0])
    app_doc = _application_doc_from_pack(pack)
    pdf_bytes = render_application_form_pdf(app_doc)

    sid = sessions[0].get("session_id", "latest")
    headers = {"Content-Disposition": f'attachment; filename="application-{sid}.pdf"'}
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf", headers=headers)


@app.get("/api/documents/{session_id}/application/pdf")
async def session_application_form_pdf(session_id: str):
    """Generate a downloadable PDF loan application from a specific session."""
    row = read_session_by_id(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    pack = build_document_pack(row)
    app_doc = _application_doc_from_pack(pack)
    pdf_bytes = render_application_form_pdf(app_doc)

    headers = {"Content-Disposition": f'attachment; filename="application-{session_id}.pdf"'}
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf", headers=headers)


# ── 9. Structured extraction (optional second pass) ──────────

@app.post("/api/extract", response_model=ExtractedProfile)
async def extract_endpoint(req: ExtractRequest):
    """Normalize free-form conversation text into structured onboarding fields."""
    try:
        data = extract_profile_from_text(req.conversation_text)
        return ExtractedProfile(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction error: {str(e)}") from e


# ── 9. Simulated OTP ────────────────────────────────────────

otp_store = {}
video_kyc_link_store: dict[str, dict] = {}


def _cleanup_video_kyc_links() -> None:
    now = time.time()
    expired_tokens = [
        token for token, record in video_kyc_link_store.items()
        if now > float(record.get("link_expires_at", 0))
    ]
    for token in expired_tokens:
        video_kyc_link_store.pop(token, None)


def _normalized_mobile(mobile_number: str) -> str:
    digits = "".join(ch for ch in mobile_number if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if mobile_number.startswith("+"):
        return mobile_number
    return f"+{digits}" if digits else mobile_number

@app.post("/api/send-otp")
async def send_otp(req: SendOTPRequest):
    """Simulate sending an OTP to a mobile number."""
    try:
        import random
        import time
        
        otp = str(random.randint(100000, 999999))
        otp_store[req.mobile_number] = {
            "otp": otp,
            "expires_at": time.time() + 300
        }
        
        print()
        print("=" * 50)
        print(f"[MOCK SMS SUCCESS] Sent to {req.mobile_number}:")
        print(f"   Your Aadhaar/PAN Verification OTP is {otp}")
        print("=" * 50)
        print()
        
        return {"status": "success", "message": "OTP sent to mobile number"}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}


@app.post("/api/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    """Verify the simulated OTP."""
    import time
    
    record = otp_store.get(req.mobile_number)
    
    if not record:
        raise HTTPException(status_code=400, detail="No OTP requested for this number")
        
    if time.time() > record["expires_at"]:
        raise HTTPException(status_code=400, detail="OTP expired")
        
    if record["otp"] == req.otp:
        del otp_store[req.mobile_number]
        return {"status": "success", "message": "KYC Verified Successfully"}
        
    raise HTTPException(status_code=400, detail="Invalid OTP")


@app.post("/api/video-kyc/request")
async def request_video_kyc_link(req: VideoKycRequestCreate):
    """Create a unique KYC link + OTP and email it via Brevo SMTP."""
    _cleanup_video_kyc_links()

    if not req.consent_accepted:
        raise HTTPException(status_code=400, detail="Consent is required before requesting Video KYC")

    smtp_user = (os.environ.get("BREVO_USER") or os.environ.get("BREVO_SMTP_USER") or "").strip()
    smtp_pass = (os.environ.get("BREVO_PASS") or os.environ.get("BREVO_SMTP_PASS") or "").strip()
    if not smtp_user or not smtp_pass:
        raise HTTPException(
            status_code=500,
            detail="Brevo SMTP credentials are not configured (set BREVO_USER and BREVO_PASS)",
        )

    sender_email = (os.environ.get("BREVO_SENDER_EMAIL") or smtp_user).strip()
    if not sender_email:
        raise HTTPException(status_code=500, detail="Brevo sender email is not configured")
    sender_name = (os.environ.get("BREVO_SENDER_NAME") or "Vantage team").strip()

    token = secrets.token_urlsafe(24)
    otp = f"{random.randint(100000, 999999)}"
    now = time.time()
    otp_expires_at = now + (10 * 60)
    link_expires_at = now + (24 * 60 * 60)

    frontend_base = (os.environ.get("FRONTEND_BASE_URL") or "http://localhost:3000").rstrip("/")
    params = [f"kyc_token={token}", f"lang={req.language or 'en'}"]
    if req.campaign_id:
        params.append(f"campaign_id={req.campaign_id}")
    kyc_link = f"{frontend_base}/call?{'&'.join(params)}"

    email_text = (
        f"Hello {req.full_name},\n\n"
        "Thank you for requesting Video KYC verification.\n\n"
        "To begin your KYC process, please click the link below:\n\n"
        "👉 Start Video KYC:\n"
        f"{kyc_link}\n\n"
        "Your OTP:\n"
        f"{otp}\n\n"
        "This OTP is valid for 10 minutes.\n\n"
        "Important Information:\n"
        "This KYC link is valid for 24 hours\n"
        "Do not share this link or OTP with anyone\n"
        "Please ensure you are in a well-lit environment for video verification.\n\n"
        "Regards,\n"
        "Vantage team."
    )

    email_html = (
        f"<p>Hello {req.full_name},</p>"
        "<p>Thank you for requesting Video KYC verification.</p>"
        "<p>To begin your KYC process, please click the link below:</p>"
        f"<p><strong>👉 Start Video KYC:</strong><br/><a href=\"{kyc_link}\">{kyc_link}</a></p>"
        f"<p><strong>Your OTP:</strong><br/>{otp}</p>"
        "<p>This OTP is valid for 10 minutes.</p>"
        "<p><strong>Important Information:</strong><br/>"
        "This KYC link is valid for 24 hours<br/>"
        "Do not share this link or OTP with anyone<br/>"
        "Please ensure you are in a well-lit environment for video verification.</p>"
        "<p>Regards,<br/>Vantage team.</p>"
    )

    message = EmailMessage()
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = req.email
    message["Subject"] = "Your Video KYC Link and OTP"
    message.set_content(email_text)
    message.add_alternative(email_html, subtype="html")

    smtp_host = (os.environ.get("BREVO_SMTP_HOST") or "smtp-relay.brevo.com").strip()
    smtp_port = int((os.environ.get("BREVO_SMTP_PORT") or "587").strip())

    def _send_via_smtp() -> None:
        context = ssl.create_default_context()
        ports_to_try = [smtp_port] + [p for p in (587, 465) if p != smtp_port]
        last_error: Exception | None = None
        for port in ports_to_try:
            try:
                if port == 465:
                    with smtplib.SMTP_SSL(smtp_host, port, timeout=20, context=context) as server:
                        server.login(smtp_user, smtp_pass)
                        server.send_message(message)
                        return
                with smtplib.SMTP(smtp_host, port, timeout=20) as server:
                    server.starttls(context=context)
                    server.login(smtp_user, smtp_pass)
                    server.send_message(message)
                    return
            except Exception as exc:
                last_error = exc
                continue
        if last_error:
            raise last_error

    try:
        await asyncio.to_thread(_send_via_smtp)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Brevo SMTP send failed: {str(e)}")

    video_kyc_link_store[token] = {
        "full_name": req.full_name,
        "email": req.email,
        "mobile_number": _normalized_mobile(req.mobile_number),
        "language": req.language or "en",
        "campaign_id": req.campaign_id,
        "otp": otp,
        "otp_expires_at": otp_expires_at,
        "link_expires_at": link_expires_at,
        "created_at": now,
        "otp_verified": False,
    }

    # Local/dev convenience: surface OTP + link when email delivery is delayed.
    dev_expose = (os.environ.get("DEV_EXPOSE_KYC_OTP") or "true").strip().lower() in {"1", "true", "yes", "on"}
    if dev_expose:
        print()
        print("=" * 64)
        print("[VIDEO KYC DEV PREVIEW]")
        print(f"Recipient: {req.email}")
        print(f"Link: {kyc_link}")
        print(f"OTP: {otp}")
        print("=" * 64)
        print()

    response = {
        "status": "success",
        "message": "Video KYC link sent to customer email",
        "link_valid_for_hours": 24,
        "otp_valid_for_minutes": 10,
    }
    if dev_expose:
        response["dev_preview"] = {
            "recipient": req.email,
            "kyc_link": kyc_link,
            "otp": otp,
            "note": "DEV mode preview enabled via DEV_EXPOSE_KYC_OTP",
        }
    return response


@app.post("/api/video-kyc/verify-otp")
async def verify_video_kyc_otp(req: VideoKycOtpVerifyRequest):
    """Verify OTP for a unique KYC link."""
    _cleanup_video_kyc_links()
    record = video_kyc_link_store.get(req.token)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired KYC link")

    now = time.time()
    if now > float(record.get("link_expires_at", 0)):
        video_kyc_link_store.pop(req.token, None)
        raise HTTPException(status_code=400, detail="KYC link expired")

    if now > float(record.get("otp_expires_at", 0)):
        raise HTTPException(status_code=400, detail="OTP expired")

    if record.get("otp") != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    record["otp_verified"] = True
    record["otp_verified_at"] = now
    video_kyc_link_store[req.token] = record

    return {
        "status": "success",
        "message": "OTP verified successfully",
        "full_name": record.get("full_name", ""),
        "mobile_number": record.get("mobile_number", ""),
        "language": record.get("language", "en"),
        "campaign_id": record.get("campaign_id", ""),
    }


# ── 10. Document Address Matching ────────────────────────────

@app.post("/api/verify-address", response_model=VerifyAddressResponse)
async def verify_address_endpoint(req: VerifyAddressRequest):
    """
    Takes an Aadhaar image and an Address Proof image (base64).
    Uses Groq Vision to extract both addresses and semantic-match them.
    """
    try:
        result = verify_address_match(
            req.aadhaar_image,
            req.pan_image,
            req.address_proof_image,
            req.selfie_image,
            req.required_documents,
            req.uploaded_documents,
            req.latitude,
            req.longitude,
        )
        return VerifyAddressResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Address verification failed: {str(e)}")


@app.post("/api/kyc/verify-documents", response_model=KycDocumentsVerifyResponse)
async def kyc_verify_documents_endpoint(req: KycDocumentsVerifyRequest):
    """Verify Aadhaar + PAN (+ selfie) before pre-approval review."""
    try:
        result = verify_kyc_documents(
            req.aadhaar_image,
            req.pan_image,
            req.selfie_image,
        )
        return KycDocumentsVerifyResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KYC document verification failed: {str(e)}")


@app.post("/api/kyc/review-pdf")
async def kyc_review_pdf_endpoint(req: KycReviewPdfRequest):
    """Generate downloadable KYC review PDF from customer-edited details."""
    try:
        pdf_bytes = render_kyc_review_pdf(req.model_dump())
        sid = req.session_id or "kyc-review"
        headers = {"Content-Disposition": f'attachment; filename="{sid}.pdf"'}
        return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KYC review PDF generation failed: {str(e)}")


# ── 10. NBFC Modular Loan Journey ───────────────────────────

@app.post("/api/interview/preapprove", response_model=InterviewPreapprovalResponse)
async def interview_preapprove(req: InterviewProfileRequest):
    out = compute_preapproval(req.model_dump())
    print("[INTERVIEW_LOG]", out)
    return InterviewPreapprovalResponse(**out)


@app.post("/api/kyc/verify-identity", response_model=KycVerifyResponse)
async def kyc_verify_identity(req: KycVerifyRequest):
    out = verify_kyc(req.model_dump())
    print("[KYC_LOG]", out)
    return KycVerifyResponse(**out)
@app.post("/api/decision/evaluate", response_model=DecisionResponse)
async def decision_evaluate(req: DecisionRequest):
    out = evaluate_decision(req.model_dump())
    print("[DECISION_LOG]", out)
    return DecisionResponse(**out)


# ── 11. Multi-Agent Orchestration ────────────────────────────────

# Singleton orchestrator instance
_orchestrator = OrchestratorAgent()


@app.post("/api/agent/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_endpoint(req: OrchestrateRequest):
    """Multi-agent orchestration endpoint.

    Accepts the current AgentState + user action, runs the agentic
    pipeline (InterviewAgent → KYCAgent → DocumentAgent → DecisionAgent),
    and returns the updated state with the next UI phase.

    The orchestrator uses Groq llama-3.3-70b-versatile with tool-calling
    to determine which sub-agent to invoke. Falls back to deterministic
    routing if the LLM is unavailable.

    Features:
    - Agentic retry loop: DocumentAgent auto-requests re-upload on
      cross-validation failure (max 3 retries per document).
    - PolicyRAG: Every decision is paired with RBI KYC Master Direction
      2016 regulatory citation via ChromaDB + MiniLM-L6-v2.
    - Full audit trail: Every agent action is timestamped and tagged
      with regulatory references for V-CIP compliance.
    """
    try:
        result = await _orchestrator.orchestrate(req)
        return result
    except Exception as e:
        logging.error(f"Orchestration error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Orchestration failed: {str(e)}",
        )


# ── 12. DPDPA Consent Management ─────────────────────────────────

@app.post("/api/consent/record")
async def record_consent(req: RecordConsentRequest):
    """Record a granular consent entry (DPDPA compliance)."""
    try:
        record = ConsentRecord(
            session_id=req.session_id,
            phone_hash=req.phone_hash,
            consent_type=req.consent_type,
            consent_given=req.consent_given,
            consent_text_version=req.consent_text_version,
            ip_address=req.ip_address,
            user_agent=req.user_agent,
        )
        rid = store_consent(record)
        return {"ok": True, "consent_id": rid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consent recording failed: {str(e)}")


@app.get("/api/consent/{session_id}")
async def get_consent(session_id: str):
    """Retrieve all consent records for a session."""
    records = get_consent_by_session(session_id)
    return {"session_id": session_id, "consents": records}


# ── 13. Human Review Queue ───────────────────────────────────────

@app.post("/api/review/escalate")
async def escalate_review(req: EscalateRequest):
    """Manually escalate a session to the human review queue."""
    try:
        item = HumanReviewItem(
            session_id=req.session_id,
            customer_name=req.customer_name,
            escalation_reason=req.escalation_reason,
            escalation_trigger=req.escalation_trigger,
            priority=req.priority,
            ai_decision=req.ai_decision,
        )
        rid = escalate_to_review(item)
        return {"ok": True, "review_id": rid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Escalation failed: {str(e)}")


@app.get("/api/review/queue")
async def review_queue(
    status: str | None = None,
    priority: str | None = None,
    limit: int = 50,
):
    """Get the current human review queue (filterable)."""
    items = get_review_queue(status=status, priority=priority, limit=limit)
    return {"queue": items, "total": len(items), "escalation_triggers": ESCALATION_TRIGGERS}


@app.post("/api/review/{session_id}/resolve")
async def resolve_review_endpoint(session_id: str, req: ResolveRequest):
    """Resolve a human review item — officer approves, rejects, or overrides."""
    updated = resolve_review(
        session_id=session_id,
        human_decision=req.human_decision,
        resolution_notes=req.resolution_notes,
        officer=req.assigned_officer,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="No pending review found for this session")
    return {"ok": True, "session_id": session_id, "status": "RESOLVED"}


# ── 14. RBAC Auth ───────────────────────────────────────────────

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Authenticate and receive a JWT token with embedded role."""
    return authenticate_user(req.username, req.password)


# ── 15. Admin Analytics ───────────────────────────────────────────

@app.get("/api/analytics/overview")
async def analytics_overview(days: int = 7, _user: dict = Depends(require_role(Role.PFL_OFFICER))):
    """Overview stats: sessions, approval/rejection rates, avg duration."""
    return get_overview_stats(days)


@app.get("/api/analytics/fraud")
async def analytics_fraud(days: int = 30, _user: dict = Depends(require_role(Role.PFL_OFFICER))):
    """Fraud flag breakdown by type."""
    return get_fraud_stats(days)


@app.get("/api/analytics/regional")
async def analytics_regional(days: int = 30, _user: dict = Depends(require_role(Role.PFL_OFFICER))):
    """Approval rates grouped by detected city."""
    return get_regional_breakdown(days)


@app.get("/api/analytics/ai-performance")
async def analytics_ai_performance(days: int = 7, _user: dict = Depends(require_role(Role.PFL_OFFICER))):
    """AI performance metrics: escalations, question counts, repeats."""
    return get_ai_performance_metrics(days)


# ── 16. Conversational Analytics Agent ───────────────────────────

from services.analytics_agent import ask_analytics
from pydantic import BaseModel as _BaseModel

class AnalyticsAskRequest(_BaseModel):
    question: str

@app.post("/api/analytics/ask")
async def analytics_ask(req: AnalyticsAskRequest, _user: dict = Depends(require_role(Role.PFL_OFFICER))):
    """Ask a natural language question about loan session data."""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    result = ask_analytics(req.question)
    return result


# ── 17. Verification Registry ────────────────────────────────────

from services.verification_registry import run_all_verifications

class VerifyRegistryRequest(_BaseModel):
    aadhaar_number: str | None = None
    pan_number: str | None = None
    declared_name: str = ""
    account_number: str | None = None
    ifsc_code: str | None = None
    gstin: str | None = None
    qr_data: str | None = None

@app.post("/api/verify/registry")
async def verify_registry(req: VerifyRegistryRequest):
    """Run all applicable official database verifications."""
    result = await run_all_verifications(
        aadhaar_number=req.aadhaar_number,
        pan_number=req.pan_number,
        declared_name=req.declared_name,
        account_number=req.account_number,
        ifsc_code=req.ifsc_code,
        gstin=req.gstin,
        qr_data=req.qr_data,
    )
    return result


# ── 18. Document Forensics Endpoint ─────────────────────────────

from services.document_match import check_document_forensics

class ForensicsRequest(_BaseModel):
    image_b64: str
    doc_type: str = "aadhaar"

@app.post("/api/documents/forensics")
async def document_forensics_endpoint(req: ForensicsRequest):
    """Run document forensics analysis (QR, metadata, edge sharpness)."""
    result = check_document_forensics(req.image_b64, req.doc_type)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
