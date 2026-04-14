# VeriCall — Agentic AI Video KYC & Multi-Stage Loan Origination System

## 🚀 Project Overview

VeriCall is a state-of-the-art, fully autonomous, multilingual AI loan origination and KYC platform built for the **Poonawalla Fincorp TenzorX Hackathon**.

It replaces the traditional paperwork-heavy loan onboarding process with a dynamic, real-time video conversation guided by a Large Language Model (Groq Llama-3.3 70B). The system interviews the customer via live voice, captures their face for deep-learning age and liveness verification, validates uploaded KYC documents (Aadhaar, PAN, Address Proof) through multimodal AI Vision OCR, cross-validates identity fields across all documents, checks geolocation, and then computes a live, personalized loan decision — all within minutes.

---

## 🛠️ The Tech Stack

### 🎨 Frontend (Client-side)

| Layer | Technology | Details |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | React 19, TypeScript 5 |
| **Styling** | Tailwind CSS v4 | Glassmorphism, animated gradients, floating orbs, custom scrollbar |
| **Animations** | Framer Motion v12 | Spring animations on OfferCard, staggered verification reveals |
| **Video Calls** | Daily.co SDK (`@daily-co/daily-js`) | Room creation API with 1-hour expiry |
| **Speech-to-Text** | Deepgram WebSocket (Nova-2) | Raw PCM linear16 streaming via `ScriptProcessorNode`, language-aware (en-IN, hi, mr) |
| **Text-to-Speech** | Native Web Speech API | `SpeechSynthesisUtterance` with `hi-IN`, `mr-IN`, `en-US` voice maps |
| **Video Capture** | Native HTML5 `<video>` + `<canvas>` | getUserMedia → base64 JPEG frame extraction for selfie capture |

### ⚙️ Backend (Server-side)

| Layer | Technology | Details |
|---|---|---|
| **Framework** | FastAPI (Python) | Async-ready, 22 API endpoints |
| **Server** | Uvicorn | Port 8001, hot-reload enabled |
| **LLM Agent** | Groq API | `llama-3.3-70b-versatile` for conversation + extraction |
| **LLM Vision** | Groq Vision API | `meta-llama/llama-4-scout-17b-16e-instruct` for document OCR |
| **Computer Vision** | DeepFace | `retinaface` backend for age estimation + emotion-based liveness |
| **Face Detection** | OpenCV (cv2) | Haar Cascade for Aadhaar photo portrait extraction |
| **Data Validation** | Pydantic v2 | 20+ model classes for strict request/response schemas |
| **PDF Generation** | ReportLab | A4 layout with embedded applicant photo |
| **HTTP Client** | httpx | Async for Daily.co API, sync for Nominatim reverse geocoding |
| **Audit Storage** | SQLite (primary) + JSONL (fallback) | Thread-safe, indexed queries, UPSERT support |
| **Geocoding** | OpenStreetMap Nominatim | Reverse geocode for document city vs browser location matching |

---

## 🎯 Core Features & System Capabilities

### 1. 🌍 Full Multilingual Experience
- A 100% natively localized experience in **English**, **Hindi (हिंदी)**, and **Marathi (मराठी)** — 35+ translation keys across all screens.
- **Dynamic NLP Prompting:** The chosen language binds to the Groq agent's core system instructions — the AI natively replies in the user's selected language.
- **Voice Maps:** TTS synthesizes localized accents (`hi-IN`, `mr-IN`) instead of mispronouncing Hindi/Marathi using English defaults.
- **STT Language Routing:** Deepgram WebSocket URL is dynamically built with the correct language model (`en-IN`, `hi`, `mr`).

### 2. 🤖 Interactive Conversational Profiling
- Real-time Deepgram STT streams PCM linear16 audio via WebSocket, transcribing speech into text.
- Every 8 seconds (or on natural utterance end), accumulated transcript is dispatched to the Llama-3.3 70B brain.
- The LLM orchestrates context and gracefully asks for unfulfilled required details: `Name`, `Employment Type`, `Monthly Income`, `Loan Type`, `Requested Amount`, `Declared Age`.
- **Mandatory Verbal Consent:** As the LAST question before completing, the agent must collect explicit consent for video recording per RBI regulations. If refused, the application is blocked.
- Echo prevention: STT microphone is muted during TTS playback to prevent feedback loops.
- Rate limit handling: 30-second backoff with user-visible notice if Groq API is temporarily throttled.
- Manual text input fallback available throughout the conversation.

### 3. 🛡️ Advanced Age & Liveness Verification (DeepFace)
- Multi-frame analysis: up to 5 webcam frames analyzed, median age used for stability.
- **Bias Correction:** Applies systematic correction (-6 years for <35, -3 years for ≥35) to account for DeepFace overestimation.
- **Tiered Age Matching:** Δ ≤5 yrs → 1.0 (strong match), Δ ≤8 yrs → 0.78, Δ ≤12 yrs → 0.45, Δ >12 yrs → fraud flag.
- **Emotion-based Liveness:** If the dominant detected emotion ≠ "neutral", the liveness check passes — prevents static photo attacks.
- Automatic **Fraud Matrix** tag (`AGE_MISMATCH`, high severity) if visual age drifts >12 years from stated age.

### 4. 📄 AI-Powered Document Verification (Groq Vision OCR)
Using the **Llama 4 Scout 17B** multimodal vision model, the system performs comprehensive document analysis:
- **Triple-document OCR** in a single prompt: Aadhaar, PAN, and Address Proof images.
- Extracts: name, DOB, gender, blood group, Aadhaar number, PAN number, full address, city.
- **Cross-document validation:** Name match, DOB match, gender match, address semantic match — all across all 3 documents.
- **Aadhaar Verhoeff Checksum:** Full Verhoeff algorithm implementation validates Aadhaar number integrity.
- **PAN Format Validation:** Strict regex `[A-Z]{5}[0-9]{4}[A-Z]`.
- **Geolocation City Match:** Browser GPS → Nominatim reverse geocode → compared against document's stated city.
- **Aadhaar Photo Extraction:** OpenCV Haar Cascade detects and crops the portrait from the Aadhaar card image, returned as base64 for the application form.

### 5. 🗂️ The Comprehensive Loan Journey System
A 4-phase state machine driving dynamic UI panels:

- **Phase 1: Pre-Approval Profiling** — AI conversation extracts customer data. Pre-approval calculated using employment-based income multipliers (salaried: 10–15x, self-employed: 6–10x, professional: 8–12x).
- **Phase 2: KYC Check** — Aadhaar + PAN regex validation, selfie capture, deterministic face match scoring (threshold ≥0.65). Age mismatch (Δ ≥8 yrs) triggers HIGH_RISK flag.
- **Phase 3: Document Upload & AI Verification** — Groq Vision OCR extracts and cross-validates all documents. Verhoeff checksum, city geolocation match, Aadhaar photo extraction.
- **Phase 4: Final Decision** — Computes APPROVED/REJECTED/HOLD with final amount, interest rate (base 12%, adjusted for income), and tenure options [12, 24, 36, 48 months].

### 6. 📊 Multi-Signal Risk & Offer Engine
- **Fraud Detection** (`fraud.py`): 6 signal categories — visual age mismatch, GPS location (India bounding box), income-employment consistency, missing critical data, consent check, age eligibility (21–55).
- **Risk Scoring** (`risk_engine.py`): 0–100 scale (LOW=22, MEDIUM=48, HIGH=72 base + flag penalties).
- **Mock Bureau** (`bureau.py`): Deterministic scores 300–900 based on income + age + hash variance. Tracks active loans, inquiries, delinquencies, credit utilization.
- **Propensity Model** (`propensity.py`): Transparent 0–1 score with factor contributions — income (22%), bureau (18%), age stability (6%), risk band, consent.
- **Offer Engine** (`offer.py`): Employment-based multipliers, risk-adjusted rates, bureau score adjustments (≥760: -0.7%, <620: +1.3%), propensity adjustments. EMI via standard amortization formula.

### 7. 📝 Auto-Generated Application Documents
- **3-document pack** from any completed session: Loan Application Form, KYC Summary Sheet, Offer Decision Note.
- **HTML renderer:** Print-friendly A4 layout with CSS grid, embedded Aadhaar photo, signature blocks.
- **PDF generator:** ReportLab A4 canvas with photo embedding, auto-pagination, downloadable via API.
- **Session-specific URLs:** Both `/api/documents/{session_id}/application/pdf` and `/latest/` variants.

### 8. 📋 Audit Dashboard
- Server-side audit log of all completed sessions with risk band, propensity score, bureau score, and offer status.
- Browser-side last session recall via `sessionStorage`.
- SQLite with indexed columns + JSONL fallback for portability.

### 9. 🔒 RBI Compliance & Security
- **V-CIP Compliance Disclaimer** on every call session footer.
- **Mandatory verbal consent** — agent cannot proceed without explicit yes; blocked with reason if refused.
- **Session Interruption Handler** — 5-second timeout on video/voice track loss → forced session restart.
- **API Key Security** — Deepgram key proxied through backend (`/api/deepgram-token`), never exposed to browser query strings.
- **Geolocation Verification** — India bounding box check (6°–37°N, 68°–98°E).

---

## 🔄 The Complete End-to-End Onboarding Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend (Next.js)
    participant Agent as Agent API (Groq)
    participant Vision as AI Vision (DeepFace)
    participant DocAI as Document AI (Groq Vision)
    participant Journey as Journey Engine (Python)
    participant Audit as Audit Log (SQLite)

    User->>Frontend: Selects Language (EN/HI/MR)
    User->>Frontend: Enters Aadhaar/PAN + Phone
    Frontend->>Journey: POST /api/send-otp
    Note over Journey: OTP printed to console (simulated)
    User->>Frontend: Enters 6-digit OTP
    Frontend->>Journey: POST /api/verify-otp
    Frontend->>Journey: POST /api/create-room (Daily.co)
    Note over Frontend: Redirects to /call with room URL + language

    Note over Frontend: Phase 1 — AI Conversation
    Frontend->>Frontend: getUserMedia (camera + mic)
    Frontend->>Frontend: Connects Deepgram STT WebSocket
    loop Real-Time Speech (every 8s or utterance end)
        Frontend->>Agent: POST /api/agent {transcript, history, lang}
        Agent-->>Frontend: AI response (spoken via TTS)
        Note over Frontend: STT muted during TTS playback
    end
    Agent-->>Frontend: done=true + collected JSON data
    Frontend->>Journey: POST /api/interview/preapprove
    Journey-->>Frontend: Pre-approved amount + eligibility

    Note over Frontend: Phase 2 — KYC Verification
    User->>Frontend: Enters Aadhaar + PAN numbers
    Frontend->>Frontend: Auto-captures selfie (canvas.toDataURL)
    Frontend->>Journey: POST /api/kyc/verify-identity
    Journey-->>Frontend: VERIFIED/FAILED + face match score

    Note over Frontend: Phase 3 — Document Upload & AI OCR
    User->>Frontend: Uploads Aadhaar, PAN, Address Proof images
    Frontend->>DocAI: POST /api/verify-address {3 images + GPS}
    DocAI->>DocAI: Groq Vision extracts fields from all 3 docs
    DocAI->>DocAI: Cross-validates name/DOB/gender/address
    DocAI->>DocAI: Verhoeff checksum on Aadhaar number
    DocAI->>DocAI: Reverse geocodes GPS → city match
    DocAI->>DocAI: OpenCV extracts Aadhaar portrait photo
    DocAI-->>Frontend: Match results + extracted Aadhaar photo

    Note over Frontend: Phase 4 — Final Decision
    Frontend->>Journey: POST /api/decision/evaluate
    Journey-->>Frontend: APPROVED/REJECTED/HOLD + amount + rate + tenure
    Frontend->>Audit: POST /api/log-session (full transcript + decision)
    Frontend-->>User: Final Decision Card + PDF Download Link
```

---

## 📡 Complete API Surface (22 Endpoints)

| # | Method | Endpoint | Purpose |
|---|---|---|---|
| 1 | `GET` | `/` | Health check |
| 2 | `POST` | `/api/agent` | LLM conversation turn |
| 3 | `POST` | `/api/analyze-face` | DeepFace age + liveness analysis |
| 4 | `POST` | `/api/assess-risk` | Multi-signal fraud assessment |
| 5 | `POST` | `/api/generate-offer` | Policy-based loan offer |
| 6 | `POST` | `/api/create-room` | Daily.co video room creation |
| 7 | `GET` | `/api/deepgram-token` | Deepgram API key proxy |
| 8 | `POST` | `/api/log-session` | Persist audit record |
| 9 | `GET` | `/api/audit/recent` | Recent sessions (dashboard) |
| 10 | `GET` | `/api/documents/latest` | Auto-filled document pack |
| 11 | `GET` | `/api/documents/{id}` | Document pack by session |
| 12 | `GET` | `/api/documents/latest/application/html` | Print-friendly HTML form |
| 13 | `GET` | `/api/documents/{id}/application/html` | HTML form by session |
| 14 | `GET` | `/api/documents/latest/application/pdf` | Downloadable PDF |
| 15 | `GET` | `/api/documents/{id}/application/pdf` | PDF by session |
| 16 | `POST` | `/api/extract` | Transcript → structured JSON |
| 17 | `POST` | `/api/send-otp` | Simulated OTP dispatch |
| 18 | `POST` | `/api/verify-otp` | OTP verification |
| 19 | `POST` | `/api/verify-address` | Groq Vision document OCR + cross-validation |
| 20 | `POST` | `/api/interview/preapprove` | Pre-approval calculation |
| 21 | `POST` | `/api/kyc/verify-identity` | KYC identity verification |
| 22 | `POST` | `/api/decision/evaluate` | Final loan decision |

---

## 🗂️ Core Architecture & Directory Layout

```
vericall/
├── .env                              # API keys (GROQ, DEEPGRAM, DAILY)
├── .env.example                      # Template with all required keys
├── .gitignore                        # data/, .env, __pycache__, node_modules, .next
├── README.md
│
├── backend/
│   ├── main.py                       # FastAPI app — 22 endpoints, CORS, Uvicorn (port 8001)
│   ├── agent.py                      # Groq LLM conversation engine (Llama 3.3 70B)
│   ├── models.py                     # 20+ Pydantic request/response models
│   ├── vision.py                     # DeepFace multi-frame age + emotion analysis
│   ├── age_verification.py           # Age claim vs face estimate scoring + fraud flags
│   ├── fraud.py                      # Multi-signal fraud flag engine (6 signal categories)
│   ├── offer.py                      # Policy-based loan offer generation + explainability
│   ├── extraction.py                 # LLM second-pass transcript → structured JSON
│   ├── session_log.py                # SQLite + JSONL dual audit persistence
│   ├── requirements.txt              # 11 Python dependencies
│   │
│   └── services/
│       ├── journey_core.py           # Pre-approval, KYC verify, final decision logic
│       ├── document_match.py         # Groq Vision OCR + Verhoeff + geocoding + OpenCV
│       ├── risk_engine.py            # Numeric risk score (0–100) + decision reasons
│       ├── bureau.py                 # Deterministic mock credit bureau (300–900)
│       ├── propensity.py             # Repayment propensity scoring with factor breakdown
│       ├── document_builder.py       # 3-document auto-fill pack builder
│       ├── document_templates.py     # Print-friendly HTML loan application renderer
│       └── document_pdf.py           # ReportLab PDF generator with photo embedding
│
├── frontend/
│   ├── package.json                  # Next.js 16 + React 19 + Framer Motion + Daily.co
│   │
│   └── src/
│       ├── app/
│       │   ├── globals.css           # Design system (glass, orbs, gradients, animations)
│       │   ├── layout.tsx            # Root layout
│       │   ├── page.tsx              # Landing page (language → KYC auth → room creation)
│       │   ├── call/page.tsx         # Main interaction room (7 phases, 1174 lines)
│       │   └── dashboard/page.tsx    # Audit log viewer (server + browser sessions)
│       │
│       ├── components/
│       │   ├── OfferCard.tsx         # Animated loan offer card (Framer Motion springs)
│       │   └── TranscriptPanel.tsx   # Live conversation transcript with auto-scroll
│       │
│       └── lib/
│           ├── sttService.ts         # Deepgram WebSocket STT client (PCM linear16)
│           └── translations.ts       # EN/HI/MR i18n dictionary (35+ keys)
│
└── data/
    ├── audit_sessions.db             # SQLite primary audit storage (indexed)
    └── audit_sessions.jsonl          # JSONL fallback
```

---

## ⚡ Quick Start

### Prerequisites
- **Python 3.10+** with `pip`
- **Node.js 18+** with `npm`
- API keys for [Groq](https://console.groq.com), [Deepgram](https://console.deepgram.com), and [Daily.co](https://dashboard.daily.co)

### 1. Clone & Configure
```bash
git clone https://github.com/kkrishhhh/vericall.git
cd vericall
cp .env.example .env
# Edit .env and fill in your API keys
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
python main.py               # Starts on http://localhost:8001
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev                  # Starts on http://localhost:3000
```

### 4. Open the App
Navigate to `http://localhost:3000` → Select language → Enter Aadhaar/PAN + phone → Check **backend terminal** for the simulated OTP → Enter OTP → Start your AI video loan session.

---

## 🔑 Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | ✅ | Groq API for LLM agent, extraction, and vision OCR |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram for real-time speech-to-text |
| `DAILY_API_KEY` | ✅ | Daily.co for video call room creation |
| `AUDIT_WRITE_JSONL_COPY` | ❌ | Set to `true` to mirror SQLite writes to JSONL |
| `GROQ_VISION_MODEL` | ❌ | Override default vision model (default: `meta-llama/llama-4-scout-17b-16e-instruct`) |
| `NEXT_PUBLIC_BACKEND_URL` | ❌ | Frontend → backend URL (default: `http://127.0.0.1:8001`) |

---

## ✅ What Is Fully Built

| Feature | Status |
|---|---|
| Multilingual UI & AI agent (EN / HI / MR) | ✅ |
| Aadhaar/PAN selection + simulated OTP flow | ✅ |
| Daily.co video room creation | ✅ |
| Real-time Deepgram STT (WebSocket, Nova-2) | ✅ |
| Groq LLM conversational agent with consent flow | ✅ |
| Browser TTS with language-specific voice maps | ✅ |
| Pre-approval calculation engine | ✅ |
| KYC verification (Aadhaar/PAN regex + selfie capture) | ✅ |
| Groq Vision triple-document OCR & cross-validation | ✅ |
| Aadhaar Verhoeff checksum validation | ✅ |
| Geolocation city matching (Nominatim) | ✅ |
| Aadhaar portrait extraction (OpenCV) | ✅ |
| Final loan decision engine (APPROVED/REJECTED/HOLD) | ✅ |
| DeepFace age estimation + emotion-based liveness | ✅ |
| Multi-signal fraud detection (6 categories) | ✅ |
| Mock bureau + propensity scoring with explainability | ✅ |
| Policy-based loan offer generation | ✅ |
| Session audit logging (SQLite + JSONL) | ✅ |
| Auto-filled loan application (HTML + PDF download) | ✅ |
| Applications dashboard (server + browser sessions) | ✅ |
| Session interruption handler (5s timeout) | ✅ |
| RBI V-CIP compliance disclaimer | ✅ |
| Echo prevention (STT mute during TTS) | ✅ |
| Animated OfferCard (Framer Motion) | ✅ |
| Live transcript panel with auto-scroll | ✅ |
| Manual text input fallback | ✅ |
| Rate limit handling with UI notice | ✅ |

---

<p align="center">
  <strong>© 2026 VeriCall by TenzorX · Poonawalla Fincorp Hackathon</strong>
</p>
