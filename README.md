<![CDATA[<div align="center">

# 🎥 VeriCall — AI-Powered Video Loan Origination System

### Real-time KYC · Agentic Workflow · RBI-Compliant · Multilingual

[![Built For](https://img.shields.io/badge/Built%20For-Poonawalla%20Fincorp%20Hackathon-6366f1?style=for-the-badge)](https://pfrda.org.in)
[![Python](https://img.shields.io/badge/Backend-Python%203.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Llama%203.3-ff6600?style=for-the-badge)](https://groq.com)

> **VeriCall** is a production-grade, end-to-end AI-powered loan origination platform that replaces traditional in-branch KYC with a 5-minute live video call. An AI agent conducts the interview, verifies identity documents via OCR and Aadhaar checksum, detects fraud in real-time, and generates instant pre-approved loan offers — all fully compliant with RBI V-CIP and KYC Master Direction 2016.

</div>

---

## 📑 Table of Contents

1. [What is VeriCall?](#-what-is-vericall)
2. [Key Features](#-key-features)
3. [System Architecture](#-system-architecture)
4. [Tech Stack](#-tech-stack)
5. [Multi-Agent Architecture (Agentic System)](#-multi-agent-architecture-agentic-system)
6. [Backend Deep Dive](#-backend-deep-dive)
7. [Frontend Deep Dive](#-frontend-deep-dive)
8. [User Flow (Step-by-Step)](#-user-flow-step-by-step)
9. [RBI & Regulatory Compliance](#-rbi--regulatory-compliance)
10. [API Reference](#-api-reference)
11. [Data & Storage](#-data--storage)
12. [Security](#-security)
13. [Project Structure](#-project-structure)
14. [Setup & Installation](#-setup--installation)
15. [Environment Variables](#-environment-variables)
16. [Running the Project](#-running-the-project)
17. [Testing](#-testing)
18. [Team](#-team)

---

## 🎯 What is VeriCall?

VeriCall is a **live video-call based loan origination system** built for Poonawalla Fincorp's hackathon. It enables a customer to apply for a loan entirely through a live AI video call — from identity verification to receiving a pre-approved offer — in under 5 minutes.

### The Problem

Traditional loan origination requires:
- Physical branch visits for KYC
- Manual document verification (days of processing)
- Human agents asking repetitive questions
- No real-time fraud detection
- Paper-based consent and audit trails

### The Solution

VeriCall replaces this with:
- **AI-powered video KYC** via live webcam call
- **Real-time speech-to-text** (Deepgram) for natural conversation
- **LLM-based interview agent** (Groq Llama 3.3 70B) that adapts to the customer
- **Instant OCR document verification** with cross-validation
- **Multi-agent orchestration** for modular, auditable decisions
- **Regulatory-compliant audit trails** with RBI policy RAG citations

---

## 🌟 Key Features

| Feature | Description |
|---------|-------------|
| 🎙️ **Live AI Interview** | Groq Llama 3.3 70B conducts a conversational interview, extracting name, income, employment, and loan details |
| 🗣️ **Real-time STT** | Deepgram Nova-2 converts speech to text with low latency, supporting English, Hindi, and Marathi |
| 🔊 **Text-to-Speech** | Browser Web Speech API speaks agent responses back in the selected language |
| 🌐 **Multilingual** | Full UI translations + AI agent responses in English, Hindi (हिंदी), and Marathi (मराठी) |
| 📄 **OCR Document Verification** | Groq Vision (Llama 4 Scout) extracts structured fields from Aadhaar, PAN, and address proof |
| 🔍 **Cross-Validation** | Name, DOB, gender, and address consistency checked across 3 documents simultaneously |
| ✅ **Aadhaar Verhoeff Checksum** | Validates Aadhaar number integrity using the UIDAI-specified Verhoeff algorithm |
| 👤 **Face Match** | Selfie captured from video call matched against document photo |
| 🛡️ **Sanctions Screening** | Fuzzy matching against UNSC/UAPA sanctions and PEP lists |
| 📊 **Bureau Scoring** | Simulated CIBIL-scale credit scoring (300–900) with risk band classification |
| 📈 **Propensity Scoring** | Transparent, explainable propensity model with factor-level contributions |
| 💰 **Instant Offer Generation** | EMI computed using reducing-balance formula with risk-adjusted interest rates |
| 📍 **GPS Geo-Tagging** | Browser geolocation captured and matched against document address city (V-CIP requirement) |
| 🤖 **Agentic Document Retry** | If cross-validation fails, the agent requests specific document re-uploads (max 3 retries) instead of terminating |
| 📋 **DPDPA Consent Management** | Granular consent collection (KYC, Video Recording, Data Processing) stored in SQLite |
| 🏛️ **RBI Policy RAG** | ChromaDB + MiniLM-L6-v2 retrieves relevant RBI KYC Master Direction clauses for every decision |
| 🧑‍💼 **Admin Portal with RBAC** | JWT-authenticated admin dashboard with role-based access (officer, manager, auditor) |
| ⚠️ **Human Review Queue** | Auto-escalation to human officers when AI detects high risk, fraud, or large loans |
| 💬 **AI Banker Analytics** | Natural Language → SQL → Answer chatbot for PFL officers to query audit data |
| 📱 **Campaign Tracking** | Deep links with `campaign_id` for tracking loan origination sources |
| 🔒 **Session Interruption Handler** | Detects video track drops and allows seamless session recovery |
| 📑 **KYC PDF Generation** | ReportLab-generated downloadable PDF with all verified KYC data and selfie |
| 🪵 **Full Audit Trail** | Every agent action logged with timestamp, regulatory tag, and metadata |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CUSTOMER'S BROWSER                             │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │ Landing   │→ │ OTP      │→ │ Consent  │→ │ Video Call Page    │    │
│  │ Page      │  │ Verify   │  │ Step     │  │ (Camera+Mic+STT)  │    │
│  └───────────┘  └──────────┘  └──────────┘  └─────────┬──────────┘    │
│                                                         │               │
│  ┌──────────────────────────────────────────────────────┤               │
│  │ KYC Upload → Pre-Approval Review → Doc Upload → Offer Card         │
│  └──────────────────────────────────────────────────────┘               │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTP REST + WebSocket (Deepgram)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FASTAPI BACKEND (:8001)                         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATOR AGENT (LLM)                      │   │
│  │  Uses Groq tool-calling to route to the correct sub-agent        │   │
│  │  Falls back to deterministic routing if LLM is unavailable       │   │
│  └──────────┬──────────┬──────────┬──────────┬─────────────────────┘   │
│             │          │          │          │                          │
│     ┌───────▼──┐ ┌─────▼────┐ ┌──▼──────┐ ┌▼──────────┐              │
│     │Interview │ │  KYC     │ │Document │ │Decision   │              │
│     │Agent     │ │  Agent   │ │Agent    │ │Agent      │              │
│     │          │ │          │ │         │ │           │              │
│     │•Preappr. │ │•Aadhaar  │ │•OCR     │ │•Bureau    │              │
│     │•Consent  │ │•Verhoeff │ │•Cross-  │ │•Propensity│              │
│     │•Income   │ │•Face     │ │ valid   │ │•Offer Gen │              │
│     │ check    │ │ match    │ │•Geo-tag │ │•RAG Policy│              │
│     │          │ │•Sanctions│ │•Aadhaar │ │           │              │
│     │          │ │          │ │ masking │ │           │              │
│     │          │ │          │ │•Retry   │ │           │              │
│     └──────────┘ └──────────┘ │ loop    │ └───────────┘              │
│                               └─────────┘                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  SUPPORT SERVICES                                                 │  │
│  │  • Vision OCR (Groq Llama 4 Scout)     • Fraud Engine            │  │
│  │  • Age Verification (DeepFace)          • Offer Policy Engine     │  │
│  │  • Profile Extraction (Groq LLM)       • Session Logging (SQLite)│  │
│  │  • Bureau Scoring (Mock CIBIL)          • RBAC & JWT Auth         │  │
│  │  • Propensity Model                     • Consent Manager (DPDPA) │  │
│  │  • Document Cross-Match                 • Human Review Queue      │  │
│  │  • Verification Registry (UIDAI/NSDL/GST/Bank)                   │  │
│  │  • PolicyRAG (ChromaDB + MiniLM-L6-v2)                           │  │
│  │  • Analytics Agent (NL→SQL→Answer)                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  DATA LAYER                                                       │  │
│  │  • SQLite: audit_sessions, human_review_queue, consent_records    │  │
│  │  • ChromaDB (in-memory): RBI KYC Master Direction 2016 chunks     │  │
│  │  • JSONL: audit_log.jsonl (optional mirror)                       │  │
│  │  • data/rbi_kyc_master_direction_2016.txt (regulatory source)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                                │
│  • Groq API (Llama 3.3 70B + Llama 4 Scout Vision)                     │
│  • Deepgram API (Nova-2 STT — WebSocket streaming)                     │
│  • Daily.co API (Video room creation — optional)                       │
│  • OpenStreetMap Nominatim (Reverse geocoding for V-CIP)               │
│  • GST Government API (Real GSTIN verification — free public API)      │
│  • [Production] UIDAI e-KYC, NSDL PAN, AWS Rekognition                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Python** | Core language | 3.11+ |
| **FastAPI** | REST API framework with async support | Latest |
| **Uvicorn** | ASGI server | Latest |
| **Groq SDK** | LLM inference (Llama 3.3 70B + Llama 4 Scout Vision) | Latest |
| **DeepFace** | Face analysis and age estimation from video frames | Latest |
| **ChromaDB** | Vector store for RAG policy retrieval | Latest |
| **sentence-transformers** | MiniLM-L6-v2 embeddings for RAG | Latest |
| **Pydantic v2** | Data validation and serialization | Latest |
| **SQLite** | Audit log, consent records, review queue | Built-in |
| **ReportLab** | KYC review PDF generation | Latest |
| **PyJWT** | JWT token generation/validation for admin auth | Latest |
| **httpx** | Async HTTP client (geocoding, GST API) | Latest |
| **pyzbar + Pillow** | QR code reading from Aadhaar cards | Latest |
| **python-dotenv** | Environment variable management | Latest |

### Frontend

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Next.js** | React framework with App Router | 16.2.3 |
| **React** | UI library | 19.2.4 |
| **TypeScript** | Type-safe JavaScript | 5.x |
| **Tailwind CSS** | Utility-first CSS framework | 4.x |
| **Framer Motion** | Animations and transitions | 12.38.0 |
| **@daily-co/daily-js** | Video call room integration | 0.87.0 |
| **Web Speech API** | Browser-native text-to-speech | Built-in |
| **Inter (Google Fonts)** | Typography | — |

### External APIs

| Service | Purpose | Auth |
|---------|---------|------|
| **Groq** | LLM inference (chat, vision, tool-calling) | API Key |
| **Deepgram** | Real-time speech-to-text (Nova-2) | API Key |
| **Daily.co** | Video call room creation | API Key |
| **Nominatim (OSM)** | Reverse geocoding for V-CIP geo-tagging | Free |
| **GST Gov API** | Real GSTIN verification | Free |

---

## 🤖 Multi-Agent Architecture (Agentic System)

VeriCall uses a **multi-agent orchestration pattern** where each agent is responsible for a specific phase of the loan origination process:

### Agent Overview

```
                    ┌──────────────────────────┐
                    │    OrchestratorAgent      │
                    │  (Groq Tool-Calling LLM)  │
                    │                            │
                    │  Decides which sub-agent   │
                    │  to invoke based on:       │
                    │  • current_phase           │
                    │  • user_action             │
                    │  • session state            │
                    └──────┬─────────────────────┘
                           │
            ┌──────────────┼──────────────┬──────────────┐
            ▼              ▼              ▼              ▼
    ┌──────────────┐┌─────────────┐┌─────────────┐┌─────────────┐
    │ Interview    ││ KYC         ││ Document    ││ Decision    │
    │ Agent        ││ Agent       ││ Agent       ││ Agent       │
    │              ││             ││             ││             │
    │ 3 tools:     ││ 4 tools:    ││ 4 tools:    ││ 4 tools:    │
    │ •preapproval ││ •aadhaar fmt││ •OCR docs   ││ •bureau     │
    │ •consent     ││ •verhoeff   ││ •cross-val  ││ •propensity │
    │ •income chk  ││ •face match ││ •geo-match  ││ •offer gen  │
    │              ││ •sanctions  ││ •mask aadhaar││ •RAG policy │
    └──────────────┘└─────────────┘└──────┬──────┘└─────────────┘
                                          │
                                    ┌─────▼──────┐
                                    │ Retry Loop │
                                    │ (max 3x)   │
                                    │ ↓           │
                                    │ MANUAL      │
                                    │ REVIEW      │
                                    └────────────┘
```

### Shared State: `AgentState`

All agents read from and write to a single **Pydantic v2** state object (`AgentState`) that flows through the pipeline:

- **`CustomerProfile`** — Name, income, employment, loan type, consent
- **`KYCStatus`** — Aadhaar valid, PAN valid, face match score, sanctions clear
- **`DocumentResults`** — OCR results, cross-validation, geo-match, Aadhaar masked
- **`RiskAssessment`** — Bureau score, propensity score, fraud flags, risk band
- **`OfferDetails`** — Approved amount, interest rate, EMI, tenure options
- **`GeoTag`** — Latitude, longitude, city (V-CIP)
- **`AuditTrail`** — Immutable append-only log with regulatory tags
- **`RetryRequests`** — Document re-upload requests from the agentic retry loop

### Phase Transitions

```
interview → kyc → document → decision → complete
                      ↑          │
                      └──────────┘  (retry loop on cross-validation failure)
                                │
                          manual_review (if retries exhausted)
```

### PolicyRAGAgent

A separate **RAG agent** that uses:
- **ChromaDB** (in-memory) with **MiniLM-L6-v2** sentence transformer embeddings
- **RBI KYC Master Direction 2016** text (~25,000 words), chunked at ~500 tokens with 50-word overlap
- Returns top-K most relevant regulatory clauses for any decision
- Every loan decision is paired with a RAG citation in the audit trail

---

## ⚙️ Backend Deep Dive

### Core Modules (Legacy Monolithic Layer)

These modules are the original pre-agent implementation. They still serve as direct API endpoints for the frontend journey flow:

| File | Purpose |
|------|---------|
| `main.py` | FastAPI application — all API routes, CORS, OTP, room creation, session logging, admin auth |
| `agent.py` | Groq Llama 3.3 70B conversational agent — conducts the live interview via system prompt |
| `models.py` | Pydantic models — `CustomerData`, `FraudFlag`, `OfferResult`, `RiskResult` |
| `vision.py` | Groq Vision API wrapper — extracts structured fields from document images |
| `extraction.py` | Groq LLM profile extraction — parses name, age, income, employment from free-text transcript |
| `fraud.py` | Rule-based fraud detection — income inconsistency, underage, identity mismatch flags |
| `offer.py` | Loan offer policy engine — computes pre-approval amount, interest rate, EMI, processing fee |
| `age_verification.py` | DeepFace integration — estimates age from selfie frames, compares against declared age |
| `rbac.py` | JWT-based Role-Based Access Control — officer, manager, auditor roles |
| `security_utils.py` | SHA-256 phone hashing, input sanitization, Aadhaar masking |
| `session_log.py` | SQLite audit logging — writes full session payloads for compliance |

### Agent Layer (New Modular Architecture)

| File | Tools Count | Purpose |
|------|-------------|---------|
| `agents/state.py` | — | Unified `AgentState` Pydantic model with all sub-models, enums, and audit helpers |
| `agents/orchestrator.py` | — | Central coordinator — uses Groq tool-calling to dispatch to sub-agents |
| `agents/interview_agent.py` | 3 | Pre-approval calculation, consent validation (multilingual), income inconsistency detection |
| `agents/kyc_agent.py` | 4 | Aadhaar format + Verhoeff checksum, face match, sanctions screening |
| `agents/document_agent.py` | 4 | Groq Vision OCR, cross-validation, geo-tagging, Aadhaar masking, agentic retry loop |
| `agents/decision_agent.py` | 4 | Bureau scoring, propensity model, offer generation, RAG policy query |
| `agents/rag_agent.py` | — | PolicyRAGAgent singleton — ChromaDB + MiniLM-L6-v2 for RBI compliance |

### Services Layer

| File | Purpose |
|------|---------|
| `services/journey_core.py` | Core interview/KYC/decision helpers with loan-type policy branching (6 loan types) |
| `services/bureau.py` | Mock CIBIL bureau adapter — deterministic scoring for reproducible demos |
| `services/propensity.py` | Transparent propensity scoring — factor-level contributions for explainability |
| `services/risk_engine.py` | Rule-based risk scoring (0–100) with human-readable decision reasons |
| `services/analytics.py` | SQL-based reporting — overview stats, fraud breakdowns, regional rates, AI performance |
| `services/analytics_agent.py` | Conversational AI analytics — NL question → SQL generation → LLM summary |
| `services/consent_manager.py` | DPDPA-compliant consent recording — granular consent types in SQLite |
| `services/human_review_queue.py` | Auto-escalation system — 7 trigger rules, priority-based queue for PFL officers |
| `services/verification_registry.py` | External verification services — Aadhaar, PAN, GST, Bank verification (mock + real) |
| `services/document_match.py` | Legacy document cross-matching and address verification with geo-tagging |

---

## 🎨 Frontend Deep Dive

### Pages (Next.js App Router)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | **Landing page** — Language picker → Phone → OTP → Consent → Room creation |
| `/call` | `app/call/page.tsx` | **Video call page** — Camera/mic, STT, agent conversation, KYC upload, document verification, offer card (1500+ lines) |
| `/dashboard` | `app/dashboard/page.tsx` | **User dashboard** — Recent audit sessions with risk, bureau, propensity, offer status |
| `/admin` | `app/admin/page.tsx` | **Admin portal** — JWT login, live applications table, human review queue, analytics dashboard, AI banker chatbot |

### Components

| Component | Purpose |
|-----------|---------|
| `TranscriptPanel.tsx` | Real-time animated chat transcript with role avatars, timestamps, and interim speech indicator |
| `OfferCard.tsx` | Animated loan offer card showing status, amount, EMI, verification summary, risk badge, fraud flags, confidence score |

### Libraries

| File | Purpose |
|------|---------|
| `lib/sttService.ts` | Deepgram WebSocket connection manager — handles PCM audio streaming, interim/final transcripts, utterance end detection, muting during TTS |
| `lib/translations.ts` | Full i18n translations for English, Hindi, Marathi — landing page + call page strings |

### Call Page Flow Phases

The call page (`/call`) manages the entire loan journey through these UI phases:

1. **`connecting`** — Initializing camera, microphone, and Deepgram STT
2. **`conversation`** — Live AI interview with real-time transcript + manual text fallback
3. **`analyzing`** — Processing interview data, generating pre-approval
4. **`kyc-upload`** — Upload Aadhaar + PAN images, auto-selfie capture
5. **`preapproval-review`** — Editable KYC data review, downloadable PDF
6. **`loan-docs`** — Upload address proof + loan-type-specific documents
7. **`offer`** — Final decision card (APPROVED / NEEDS_REVIEW / DECLINED)
8. **`error`** — Error state with retry option

---

## 🔄 User Flow (Step-by-Step)

```
┌─────────────────┐
│ 1. LANDING PAGE │
│    • Select language (EN/HI/MR)
│    • Enter phone number
│    • Receive OTP (printed in Python console)
│    • Verify 6-digit OTP
│    • Accept 3 mandatory consents (KYC, Video, Data)
│    • → Creates Daily.co room & navigates to /call
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. VIDEO CALL   │
│    • Camera + mic activated
│    • Deepgram STT WebSocket opened (Nova-2)
│    • AI agent greets customer in selected language
│    • Agent asks: name, age, employment, income, loan purpose, amount
│    • Customer speaks naturally (or types as fallback)
│    • Agent validates consent verbally (RBI V-CIP)
│    • Browser TTS speaks agent responses (mutes STT during playback)
│    • When `done: true` received, captures selfie from video feed
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. PRE-APPROVAL │
│    • Profile sent to /api/interview/preapprove
│    • Employment bucketed (salaried/self-employed/professional)
│    • Affordability limit computed per loan type policy
│    • Document requirements generated per loan type
│    • Pre-approval amount displayed (e.g., "Up to ₹5,40,000")
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. KYC UPLOAD   │
│    • Upload Aadhaar card image
│    • Upload PAN card image
│    • Auto-captured selfie shown
│    • → Sent to /api/kyc/verify-documents
│    • Groq Vision extracts: name, DOB, gender, Aadhaar number, PAN number
│    • Aadhaar format + Verhoeff checksum validated
│    • PAN format validated (ABCDE1234F)
│    • Face match score computed (selfie vs document photo)
│    • If VERIFIED → proceed; if FAILED → show error + retry
└────────┬────────┘
         ▼
┌──────────────────────┐
│ 5. PRE-APPROVAL      │
│    REVIEW             │
│    • Editable fields: name, Aadhaar, PAN, DOB, gender
│    • Download KYC review PDF (ReportLab)
│    • Confirm and proceed
└────────┬─────────────┘
         ▼
┌──────────────────────┐
│ 6. DOCUMENT UPLOAD   │
│    • Upload address proof
│    • Upload loan-type-specific docs (salary slip, bank statement, etc.)
│    • GPS location auto-captured
│    • → Sent to /api/verify-address
│    • Cross-validation: name, DOB, gender across Aadhaar/PAN/address proof
│    • Geo-tagging: GPS city vs document city (Nominatim reverse geocode)
│    • Aadhaar number masked (XXXX-XXXX-NNNN)
│    • If mismatch → agentic retry loop (max 3 attempts)
│    • If all pass → auto-advance to decision
└────────┬─────────────┘
         ▼
┌──────────────────────┐
│ 7. FINAL DECISION    │
│    • Bureau scoring (CIBIL-scale 300–900)
│    • Risk band determination (LOW/MEDIUM/HIGH)
│    • Propensity scoring (0.01–0.99)
│    • Interest rate computation (base 12% ± risk adjustments)
│    • EMI calculation (reducing balance formula)
│    • Full session logged to SQLite audit database
│    • Human review auto-escalation if triggers fire
│    • → OfferCard displayed with animated verification summary
└──────────────────────┘
```

---

## 🏛️ RBI & Regulatory Compliance

VeriCall is designed to comply with:

| Regulation | Implementation |
|------------|---------------|
| **RBI KYC Master Direction 2016** | Full text loaded into RAG for policy-backed decisions |
| **V-CIP (Video Customer Identification Process)** | Live video call, face matching, geo-tagging, recorded consent, concurrent audit trail |
| **UIDAI Aadhaar Guidelines** | Verhoeff checksum validation, Aadhaar number masking (show only last 4), first-digit validation |
| **DPDPA 2023 (Digital Personal Data Protection Act)** | Granular consent collection with versioning, purpose limitation |
| **UAPA Section 51A** | Sanctions list screening (UNSC + MHA) with fuzzy matching |
| **PAN Validation** | ABCDE1234F format validation, holder type extraction (4th character) |

### Regulatory Tags in Audit Trail

Every agent action is tagged with its regulatory reference:
- `RBI_KYC_2016_CH5` — Customer Due Diligence
- `RBI_KYC_2016_S3_OVD` — Officially Valid Documents
- `VCIP_CONSENT` — Video Customer Identification Process consent
- `VCIP_FACE_MATCH` — V-CIP face matching requirement
- `VCIP_GEO_TAGGING` — V-CIP geo-tagging requirement
- `UIDAI_VERHOEFF` — UIDAI Aadhaar checksum
- `RBI_AADHAAR_MASKING` — Aadhaar number masking
- `RBI_KYC_2016_S10H_UAPA_51A` — Sanctions screening
- `RBI_KYC_2016_CH4_RISK` — Risk-based approach

---

## 📡 API Reference

### Customer-Facing APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/send-otp` | Send OTP to mobile (printed to console for simulation) |
| `POST` | `/api/verify-otp` | Verify 6-digit OTP |
| `POST` | `/api/create-room` | Create Daily.co video room |
| `GET` | `/api/deepgram-token` | Get temporary Deepgram API token |
| `POST` | `/api/agent` | Send transcript to LLM agent for conversational response |
| `POST` | `/api/interview/preapprove` | Generate pre-approval based on interview data |
| `POST` | `/api/kyc/verify-documents` | OCR + verify Aadhaar, PAN, selfie |
| `POST` | `/api/kyc/review-pdf` | Generate downloadable KYC review PDF |
| `POST` | `/api/verify-address` | Full document cross-validation + geo-matching |
| `POST` | `/api/decision/evaluate` | Final loan decision engine |
| `POST` | `/api/log-session` | Log complete session to audit database |

### Consent APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/consent/record` | Record individual consent (KYC/Video/Data) |
| `GET` | `/api/consent/{session_id}` | Retrieve consent records for a session |

### Admin APIs (JWT Required)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/login` | Authenticate admin user, receive JWT token |
| `GET` | `/api/audit/recent` | Get recent audit sessions |
| `GET` | `/api/analytics/overview` | Pipeline overview stats (7-day) |
| `GET` | `/api/analytics/fraud` | Fraud flag breakdown |
| `GET` | `/api/analytics/regional` | Regional approval rate analysis |
| `GET` | `/api/analytics/ai-metrics` | AI performance metrics |
| `POST` | `/api/analytics/ask` | Natural language query → SQL → answer |
| `GET` | `/api/review/queue` | Get human review queue |
| `POST` | `/api/review/escalate` | Escalate case to human review |
| `POST` | `/api/review/{session_id}/resolve` | Resolve a review queue item |

### Agent Orchestration API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/agent/orchestrate` | Run the multi-agent pipeline (interview→kyc→document→decision) |

---

## 💾 Data & Storage

### SQLite Database (`data/audit_sessions.db`)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `audit_sessions` | Full session audit log | session_id, phone (hashed), risk_band, offer_status, payload_json |
| `consent_records` | DPDPA consent tracking | session_id, consent_type, consent_given, timestamp |
| `human_review_queue` | Escalation queue | session_id, escalation_reason, priority, status, human_decision |

### ChromaDB (In-Memory)

- Collection: `rbi_kyc_2016`
- Documents: ~50 chunks of RBI KYC Master Direction 2016
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`
- Query: Semantic similarity search for regulatory justification

### JSONL Audit Log (`data/audit_log.jsonl`)

Optional mirror of SQLite audit data in line-delimited JSON format for portability.

---

## 🔐 Security

| Feature | Implementation |
|---------|---------------|
| **Phone Hashing** | SHA-256 hash — raw phone numbers never stored |
| **Aadhaar Masking** | Only last 4 digits displayed/stored (XXXX-XXXX-NNNN) |
| **JWT Authentication** | Admin portal secured with PyJWT tokens (1-hour expiry) |
| **RBAC** | Three roles: `officer` (basic), `manager` (analytics), `auditor` (full access) |
| **SQL Injection Prevention** | Analytics agent blocks DDL/DML keywords, only allows SELECT |
| **Input Sanitization** | All user inputs sanitized through `security_utils.py` |
| **CORS** | Configured for frontend origin only |
| **No Raw PII in Logs** | Phone hashed, Aadhaar masked in all audit entries |

### Default Admin Credentials (Demo)

| Username | Password | Role |
|----------|----------|------|
| `officer` | `officer123` | Officer |
| `manager` | `manager123` | Manager |
| `auditor` | `auditor123` | Auditor |

---

## 📁 Project Structure

```
vericall/
├── backend/
│   ├── main.py                         # FastAPI app — all API routes
│   ├── agent.py                        # Groq LLM conversational agent
│   ├── models.py                       # Pydantic data models
│   ├── vision.py                       # Groq Vision API (document OCR)
│   ├── extraction.py                   # Profile extraction from transcript
│   ├── fraud.py                        # Rule-based fraud detection engine
│   ├── offer.py                        # Loan offer/policy engine
│   ├── age_verification.py             # DeepFace age estimation
│   ├── rbac.py                         # JWT + RBAC authentication
│   ├── security_utils.py               # Hashing, sanitization, masking
│   ├── session_log.py                  # SQLite session logging
│   ├── requirements.txt                # Python dependencies
│   ├── agents/
│   │   ├── __init__.py                 # Agent package init
│   │   ├── state.py                    # AgentState unified model
│   │   ├── orchestrator.py             # Orchestrator (Groq tool-calling)
│   │   ├── interview_agent.py          # InterviewAgent (3 tools)
│   │   ├── kyc_agent.py                # KYCAgent (4 tools)
│   │   ├── document_agent.py           # DocumentAgent (4 tools + retry)
│   │   ├── decision_agent.py           # DecisionAgent (4 tools)
│   │   └── rag_agent.py                # PolicyRAGAgent (ChromaDB)
│   └── services/
│       ├── journey_core.py             # Core preapproval/KYC/decision helpers
│       ├── bureau.py                   # Mock bureau credit scoring
│       ├── propensity.py               # Propensity scoring model
│       ├── risk_engine.py              # Risk score computation
│       ├── analytics.py                # SQL-based admin analytics
│       ├── analytics_agent.py          # NL→SQL conversational analytics
│       ├── consent_manager.py          # DPDPA consent management
│       ├── human_review_queue.py       # Escalation & review system
│       ├── verification_registry.py    # External verification services
│       └── document_match.py           # Document cross-matching
├── frontend/
│   ├── package.json                    # Node.js dependencies
│   ├── .env.local                      # Frontend environment variables
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # Root layout (Inter font, metadata)
│       │   ├── globals.css             # Global styles, animations, glass UI
│       │   ├── page.tsx                # Landing page (language → phone → OTP → consent)
│       │   ├── call/page.tsx           # Video call page (1500+ LOC)
│       │   ├── dashboard/page.tsx      # User applications dashboard
│       │   └── admin/page.tsx          # Admin portal (RBAC login + 4-tab dashboard)
│       ├── components/
│       │   ├── TranscriptPanel.tsx      # Live transcript with animations
│       │   └── OfferCard.tsx            # Loan offer card component
│       └── lib/
│           ├── sttService.ts            # Deepgram WebSocket STT service
│           └── translations.ts          # i18n translations (EN/HI/MR)
├── data/
│   ├── rbi_kyc_master_direction_2016.txt  # RBI regulatory text (RAG source)
│   ├── audit_sessions.db                  # SQLite audit database (auto-created)
│   └── audit_log.jsonl                    # JSONL audit mirror (auto-created)
├── .env.example                        # Environment variable template
└── README.md                           # This file
```

---

## 🚀 Setup & Installation

### Prerequisites

- **Python** 3.11+
- **Node.js** 18+
- **npm** 9+

### 1. Clone the Repository

```bash
git clone https://github.com/kkrishhhh/vericall.git
cd vericall
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

### 4. Configure Environment Variables

```bash
# Root level
cp .env.example .env
# Fill in your API keys in .env

# Frontend
# Create frontend/.env.local with:
# NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8001
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root (or `backend/` directory):

```env
# Daily.co — Video call room creation
DAILY_API_KEY=your_daily_co_api_key_here

# Deepgram — Real-time speech-to-text
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Groq — LLM inference (Llama 3.3 70B + Vision)
GROQ_API_KEY=your_groq_api_key_here

# Optional: mirror audit to JSONL file
AUDIT_WRITE_JSONL_COPY=false
```

Frontend (`frontend/.env.local`):

```env
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8001
```

---

## ▶️ Running the Project

### Start Backend

```bash
cd backend
python main.py
# → Runs on http://127.0.0.1:8001
```

### Start Frontend

```bash
cd frontend
npm run dev
# → Runs on http://localhost:3000
```

### Access Points

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Customer-facing landing page |
| `http://localhost:3000/call?room=...` | Live video call (auto-navigated) |
| `http://localhost:3000/dashboard` | Applications dashboard |
| `http://localhost:3000/admin` | Admin portal (login required) |
| `http://127.0.0.1:8001/docs` | FastAPI Swagger documentation |

---

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Unit test for agent tools
python test_agents.py

# End-to-end flow test
python test_e2e_flow.py
```

### Manual Testing Flow

1. Start both backend and frontend
2. Open `http://localhost:3000`
3. Select language → Enter phone → Check terminal for OTP → Enter OTP
4. Accept all 3 consents
5. In the video call, speak to the AI agent (or type in the text box)
6. After the conversation completes, upload Aadhaar and PAN images
7. Review extracted KYC data, download PDF
8. Upload address proof
9. View your loan offer
10. Check `http://localhost:3000/admin` (login: `officer` / `officer123`)

---

## 👥 Team

**Team TenzorX**

Built for the **Poonawalla Fincorp Hackathon 2026**.

---

## 📜 License

This project was built as a hackathon submission and is intended for demonstration purposes.

---

<div align="center">

**Built with ❤️ by Team TenzorX**

*AI-Powered · RBI-Compliant · Production-Ready*

</div>
]]>
