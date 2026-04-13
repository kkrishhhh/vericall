"""VeriCall — FastAPI Backend Entry Point."""

import os
import time
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import (
    AgentRequest, AgentResponse,
    FaceAnalysisRequest, FaceAnalysisResponse,
    RiskAssessmentRequest, RiskAssessmentResponse,
    OfferRequest, LoanOffer,
    RoomResponse, CustomerData,
    SessionAuditPayload, SessionAuditResponse,
    ExtractRequest, ExtractedProfile,
    SendOTPRequest, VerifyOTPRequest,
)
from agent import run_agent
from vision import analyze_face
from fraud import assess_risk
from offer import generate_offer
from session_log import append_session_record, read_recent_sessions, read_session_by_id
from extraction import extract_profile_from_text
from services.document_builder import build_document_pack
from services.document_templates import render_application_form_html
from services.document_pdf import render_application_form_pdf

# Load env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(
    title="VeriCall API",
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
    return {"status": "ok", "service": "VeriCall API", "version": "1.0.0"}


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
