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
)
from agent import run_agent
from vision import analyze_face
from fraud import assess_risk
from offer import generate_offer

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
    """Analyze a face image for age estimation."""
    try:
        result = analyze_face(req.image)
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
    """Return the Deepgram API key for frontend STT connection."""
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Deepgram API key not configured")
    return {"token": key}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
