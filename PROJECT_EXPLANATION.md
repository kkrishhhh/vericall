# VeriCall Project Explanation (Complete, Easy-to-Understand)

## 1. What this project is

VeriCall is an AI-assisted loan onboarding and verification platform.

In plain words, it helps a customer:
1. Start from a phone + OTP flow.
2. Join a live video call with an AI agent.
3. Complete KYC checks using Aadhaar, PAN, selfie, and additional documents.
4. See a pre-approved amount.
5. Review and download a KYC review PDF.
6. Submit loan-type-specific documents.
7. Get a final decision with amount, interest, and tenure.

It is built to feel like an end-to-end digital loan journey and includes compliance-oriented checks (consent, KYC evidence, audit logs, geo/location checks, etc.).

---

## 2. High-level architecture

The project has two major parts:

1. Frontend (Next.js): customer-facing UI and journey orchestration.
2. Backend (FastAPI): APIs, AI integrations, verification logic, decision logic, document generation, and audit logging.

There are also two styles of backend processing:

1. Direct flow APIs (used heavily by current UI):
- Conversation, preapproval, KYC verification, document verification, decision, PDF generation.

2. Multi-agent orchestration APIs (advanced/agentic mode):
- A dedicated orchestrator routes tasks to Interview/KYC/Document/Decision agents and can attach policy citations via RAG.

---

## 3. Technologies used

### Frontend stack
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Deepgram WebSocket integration for real-time STT (client-side audio streaming)
- Browser Web Speech API for TTS
- Browser camera APIs (`getUserMedia`, canvas capture, ImageCapture fallback)

### Backend stack
- FastAPI
- Uvicorn
- Pydantic
- Groq API (LLM + Vision)
- DeepFace (face comparison / visual checks)
- OpenCV (face crop from docs)
- httpx
- ReportLab (PDF generation)
- SQLite + JSONL fallback for audit persistence
- ChromaDB + sentence-transformers for policy RAG (agentic path)

### External services used
- Daily.co for room creation
- Deepgram for speech-to-text
- Groq for language/vision tasks
- OpenStreetMap Nominatim for reverse geocoding

---

## 4. Frontend features in detail

## 4.1 Landing page flow (`frontend/src/app/page.tsx`)

Features:
1. Language selection (English, Hindi, Marathi).
2. Phone number entry and OTP request.
3. OTP verification before entering call flow.
4. Campaign metadata support from URL query params (`campaign_id`, `campaign_link`).
5. On successful OTP + room creation, redirects into call flow with params.

Why this matters:
- It creates a controlled start of session.
- It allows campaign attribution and analytics context to travel through the flow.

## 4.2 Call page flow (`frontend/src/app/call/page.tsx`)

The UI uses explicit phases:
1. `connecting`
2. `conversation`
3. `analyzing`
4. `kyc-upload`
5. `preapproval-review`
6. `loan-docs`
7. `offer`
8. `error`

Important features:
1. Camera/mic initialization and robust stream cleanup.
2. Session drop detection if media track ends unexpectedly.
3. Geolocation capture for later city comparison checks.
4. Real-time transcript panel with interim and final speech text.
5. Manual text input fallback in case STT fails.
6. Selfie capture from video call before camera shutdown.
7. Dedicated KYC step (Aadhaar + PAN + selfie preview).
8. Editable KYC review step with downloadable KYC review PDF.
9. Loan-document step after KYC review (address proof + additional docs by requirement).
10. Final decision view using `OfferCard`.

## 4.3 Dashboard (`frontend/src/app/dashboard/page.tsx`)

Features:
1. Reads latest local session from browser storage.
2. Fetches recent server audit sessions.
3. Shows campaign metadata, risk, propensity, bureau, and offer status.
4. Gives a quick operations view of processed applications.

## 4.4 Shared frontend support modules

1. `frontend/src/lib/sttService.ts`
- Builds Deepgram listen URL with language and sample rate.
- Streams PCM audio in `linear16` format.
- Supports interim/final transcripts, utterance events, error handling, and mute control.

2. `frontend/src/lib/translations.ts`
- Multi-language text dictionary for landing and call experiences.

3. `frontend/src/components/TranscriptPanel.tsx`
- Live conversation transcript UI.

4. `frontend/src/components/OfferCard.tsx`
- Rich final offer rendering with verification and risk context.

---

## 5. Backend features in detail

## 5.1 API layer (`backend/main.py`)

Total endpoints: 26

Core groups:

1. AI and analysis
- `POST /api/agent`
- `POST /api/analyze-face`
- `POST /api/assess-risk`
- `POST /api/generate-offer`

2. Session and call setup
- `POST /api/create-room`
- `GET /api/deepgram-token`

3. Audit and documents
- `POST /api/log-session`
- `GET /api/audit/recent`
- `GET /api/audit/session/{session_id}`
- `GET /api/documents/latest`
- `GET /api/documents/{session_id}`
- HTML/PDF variants for application forms

4. KYC and journey progression
- `POST /api/extract`
- `POST /api/send-otp`
- `POST /api/verify-otp`
- `POST /api/verify-address`
- `POST /api/kyc/verify-documents`
- `POST /api/kyc/review-pdf`
- `POST /api/interview/preapprove`
- `POST /api/kyc/verify-identity`
- `POST /api/decision/evaluate`

5. Multi-agent orchestration
- `POST /api/agent/orchestrate`

## 5.2 Conversation and extraction

1. `backend/agent.py`
- Runs LLM-driven conversational loan profiling.
- Keeps history and supports multi-language behavior.

2. `backend/extraction.py`
- Converts text conversation into structured profile data.

## 5.3 Visual and risk services

1. `backend/vision.py`
- Face analysis (age and liveness-style signals).

2. `backend/age_verification.py`
- Scoring logic for face-estimated age vs declared age.

3. `backend/fraud.py`
- Multi-signal fraud and risk rule checks.

## 5.4 Offer and scoring services

1. `backend/offer.py`
- Converts profile/risk context into loan offer terms.

2. `backend/services/bureau.py`
- Mock bureau scoring utility.

3. `backend/services/propensity.py`
- Repayment propensity scoring utility.

4. `backend/services/risk_engine.py`
- Risk banding and explanation generation.

## 5.5 KYC and document verification services

1. `backend/services/journey_core.py`
- Pre-approval logic.
- KYC identity checks for direct journey APIs.
- Final decision evaluation.

2. `backend/services/document_match.py`
- OCR-assisted verification for Aadhaar/PAN/address proof.
- Identity consistency checks (name/DOB/gender/number formats).
- Aadhaar Verhoeff checksum validation.
- Geolocation city matching support.
- Face/selfie comparison logic.

Current selfie behavior in KYC document verification:
- Uses both Aadhaar and PAN face crops when available.
- Uses best available selfie match score.
- Treats very low-confidence mismatch as hard fail.
- Treats borderline/unavailable checks as manual-review style warnings.

3. `backend/services/document_builder.py`
- Builds document packs from session data.

4. `backend/services/document_templates.py`
- HTML rendering for application forms.

5. `backend/services/document_pdf.py`
- PDF generation for application and KYC review sheets.
- Supports embedding captured photo data in generated PDFs.

## 5.6 Persistence and audit

1. `backend/session_log.py`
- Writes/reads audit sessions.
- Supports SQLite and JSONL fallback.
- Used by dashboard APIs and document generation.

2. `data/audit_sessions.jsonl`
- Append-only style session records.

---

## 6. Multi-agent subsystem (advanced architecture)

Located in `backend/agents`:

1. `orchestrator.py`
- Central coordinator.
- Chooses and dispatches one sub-agent per action.
- Maintains phase transitions and audit events.

2. `interview_agent.py`
- Preapproval calculations.
- Consent detection.
- Income consistency checks.

3. `kyc_agent.py`
- Aadhaar format and checksum validation.
- PAN format check.
- Face match utility.
- Sanctions screening utility.

4. `document_agent.py`
- OCR for document images.
- Cross-doc field validation.
- Geo-match checks.
- Aadhaar masking utility.
- Retry loop design for reupload handling.

5. `decision_agent.py`
- Bureau + propensity + offer generation tools.
- RBI policy citation lookup integration.

6. `rag_agent.py`
- Loads RBI policy text.
- Chunks and embeds policy content into vector store.
- Returns most relevant clauses for a query.

7. `state.py`
- Complete shared state model for the orchestrated journey.

Why this matters:
- This enables a modular and explainable decision pipeline.
- Each stage is separately auditable.

---

## 7. How features connect end-to-end

Simple end-to-end path (current user experience):

1. User selects language and verifies OTP.
2. Frontend creates a call room and enters call page.
3. AI conversation collects profile basics.
4. Backend computes pre-approved range.
5. User uploads Aadhaar + PAN and system verifies KYC with selfie.
6. User reviews/edit KYC details and downloads KYC review PDF.
7. User uploads additional loan documents.
8. Backend verifies document consistency + geo + required-doc completeness.
9. Backend evaluates final decision.
10. Session is logged and appears in dashboard + document APIs.

System glue points:
1. Query params carry campaign info from landing to call.
2. Session ID binds call flow, logs, and generated PDFs.
3. Backend responses feed phase transitions in the frontend state machine.
4. Audit persistence powers dashboard visibility and post-call documents.

---

## 8. Compliance and controls present in project

1. Consent capture and consent-aware progression.
2. KYC identity checks with multiple evidence points.
3. Geo evidence support (browser location + reverse geocoding).
4. Explicit audit trail logging.
5. Document generation for operational record and review.
6. Session interruption handling in call UI.

---

## 9. Testing and validation artifacts in repo

1. `backend/test_agents.py`
- Quick checks for RAG/orchestrator/agent flow behavior.

2. `backend/test_e2e_flow.py`
- End-to-end style orchestrated path simulation.

3. Runtime checks typically used:
- `python -m py_compile ...` for backend syntax checks.
- `npm run dev` for frontend local execution.
- `python -m uvicorn main:app --reload` from repo root (supported via root entrypoint shim).

---

## 10. Important project files map

Root:
- `main.py`: root ASGI entrypoint shim to make `uvicorn main:app` work from repository root.
- `README.md`: high-level project summary.
- `walkthrough.md`: deep walkthrough style documentation.
- `PROJECT_EXPLANATION.md`: this full explanatory reference.

Backend:
- `backend/main.py`: all API routes.
- `backend/models.py`: API contracts.
- `backend/services/*`: business and verification engines.
- `backend/agents/*`: orchestrated multi-agent path.

Frontend:
- `frontend/src/app/page.tsx`: language + OTP start.
- `frontend/src/app/call/page.tsx`: complete live journey.
- `frontend/src/app/dashboard/page.tsx`: audit dashboard.
- `frontend/src/components/*`: reusable UI pieces.
- `frontend/src/lib/*`: STT + translations.

---

## 11. In one sentence

VeriCall is a full-stack, multilingual, AI-enabled digital loan onboarding system that combines live conversation, KYC/document intelligence, policy-aware decisioning, and auditable outputs into one connected journey.
