"""VeriCall — FastAPI Backend Entry Point."""

import os
import time
import httpx
from fastapi import FastAPI, HTTPException
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
from session_log import append_session_record, read_recent_sessions
from extraction import extract_profile_from_text

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
        result = run_agent(req.transcript, req.conversation_history)
        return AgentResponse(
            message=result["message"],
            done=result["done"],
            data=result.get("data"),
        )
    except Exception as e:
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
            fraud_flags=[f.model_dump() if hasattr(f, 'model_dump') else f for f in req.fraud_flags],
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


# ── 8. Structured extraction (optional second pass) ──────────

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
    import random
    import time
    
    otp = str(random.randint(100000, 999999))
    otp_store[req.mobile_number] = {
        "otp": otp,
        "expires_at": time.time() + 300
    }
    
    print()
    print("=" * 50)
    print(f"✅ [MOCK SMS] Sent to {req.mobile_number}:")
    print(f"   Your Aadhaar/PAN Verification OTP is {otp}")
    print("=" * 50)
    print()
    
    return {"status": "success", "message": "OTP sent to mobile number"}

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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
