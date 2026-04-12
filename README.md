# VeriCall — AI Video Loan Origination

> Agentic AI-powered video call onboarding system for Poonawalla Fincorp  
> Built for TenzorX 2026 National AI Hackathon

## What It Does

A customer opens a link → joins a live video call → an AI agent guides them through a 5-question loan application → the system analyzes their face, voice, and location → a personalized loan offer card appears on screen. **All in under 5 minutes.**

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
│  Landing Page → Video Call → Transcript → Offer Card    │
│  Daily.co WebRTC │ Deepgram STT │ Framer Motion         │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────┴──────────────────────────────────┐
│                   BACKEND (FastAPI)                      │
│  /api/agent         │ Groq LLM (Llama 3.3 70B)          │
│  /api/analyze-face  │ DeepFace age estimation            │
│  /api/assess-risk   │ Risk + fake bureau + propensity    │
│  /api/generate-offer│ Policy engine + explainable offer  │
│  /api/log-session   │ Structured session audit (SQLite)  │
│  /api/create-room   │ Daily.co room management           │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Video | Daily.co WebRTC |
| Speech-to-Text | Deepgram Nova-2 (real-time streaming) |
| LLM Agent | Groq API (Llama 3.3 70B) |
| Age Detection | DeepFace (runs locally, no API key) |
| Geolocation | Browser Geolocation API |
| Backend | Python FastAPI + Pydantic |
| Persistence | SQLite audit repository (+ JSONL fallback) |
| Animations | Framer Motion |

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- API keys: Daily.co, Deepgram, Groq

### 1. Clone & Setup
```bash
git clone https://github.com/kkrishhhh/vericall.git
cd vericall
```

### 2. Environment Variables
Create `.env` in the project root:
```
DAILY_API_KEY=your_daily_co_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
GROQ_API_KEY=your_groq_api_key
AUDIT_WRITE_JSONL_COPY=false
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_api_key
NEXT_PUBLIC_DAILY_API_KEY=your_daily_co_api_key
```

### 3. Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py
```
Backend runs at `http://127.0.0.1:8000`

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:3000`

## Demo Flow

1. Open landing page → enter phone number → click "Start Application"
2. Camera + mic permissions → video call begins
3. AI agent greets: *"Hi! I'm VeriCall, your digital loan assistant"*
4. Answer 5 questions: name, age, income, employment, loan purpose
5. Live transcript appears in real-time sidebar
6. Age verification runs silently via webcam snapshot
7. Location verified via browser GPS
8. **Animated offer card appears**: PRE-APPROVED — ₹3,50,000 at 12.5% — EMI ₹11,720
9. Confidence score: 0.84 — all fraud checks passed

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent` | POST | LLM conversation — accepts transcript, returns next question |
| `/api/analyze-face` | POST | DeepFace age estimation from base64 image |
| `/api/assess-risk` | POST | Multi-signal fraud detection |
| `/api/generate-offer` | POST | Policy engine → personalized loan offer with explainability |
| `/api/create-room` | POST | Create Daily.co video call room |
| `/api/deepgram-token` | GET | Deepgram API key for frontend STT |
| `/api/log-session` | POST | Persist structured session audit payload |
| `/api/audit/recent` | GET | Read recent sessions from SQLite audit log |
| `/api/documents/latest` | GET | Generate auto-filled document pack from latest session |
| `/api/documents/{session_id}` | GET | Generate auto-filled document pack for a session |
| `/api/documents/latest/application/html` | GET | Render PDF-ready HTML application form from latest session |
| `/api/documents/{session_id}/application/html` | GET | Render PDF-ready HTML application form by session |
| `/api/documents/latest/application/pdf` | GET | Download application form as PDF from latest session |
| `/api/documents/{session_id}/application/pdf` | GET | Download application form as PDF by session |

## Fraud Detection Signals

- **Age mismatch**: DeepFace estimate vs declared age (>8 year threshold)
- **Location spoofing**: GPS vs India bounding box
- **Income inconsistency**: LLM detects logical conflicts
- **Consent verification**: Explicit verbal consent required
- **Age eligibility**: 21–55 years

## Decision Intelligence

- **Mock bureau adapter**: deterministic bureau score + tradeline summary (`mock_bureau_v1`)
- **Propensity model**: transparent formula (`propensity_formula_v1`) with factor contributions
- **Explainable output**: risk and offer responses include reason codes and decision trace
- **Structured session schema**: campaign/lead IDs, model versions, decision trace, and audit metadata

## Team

**TenzorX** — Built by Krishna Thakur

---

*© 2026 VeriCall · Poonawalla Fincorp Hackathon · All decisions are pre-qualifications only*
