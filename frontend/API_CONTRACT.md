# VeriCall Vantage — Frontend/Backend API Contract

This document outlines the API contract between the Frontend and Backend for the Vantage loan onboarding prototype. All endpoints here are centralized inside the frontend's custom `apiClient.ts` service.

## Core Endpoints

| Endpoint | Method | Description | Request Shape | Response Shape | Status |
|---|---|---|---|---|---|
| `/api/health` | `GET` | System health check and status verification | None | `{"status": "ok"}` | `Connected` / `Stub Fallback` |
| `/api/auth/send-otp` | `POST` | Dispatches verification OTP code to customer phone number | `{"phoneNumber": "string"}` | `{"success": true, "message": "string"}` | `Stub Fallback` |
| `/api/auth/verify-otp` | `POST` | Authenticates customer with phone number and OTP code | `{"phoneNumber": "string", "code": "string"}` | `{"success": true, "token": "string", "message": "string"}` | `Stub Fallback` |
| `/api/liveness/challenge` | `GET` | Requests a new randomized liveness prompt for customer to perform | None | `{"challengeId": "string", "instruction": "string", "expectedGesture": "string"}` | `Connected` / `Stub Fallback` |
| `/api/liveness/verify` | `POST` | Uploads raw recorded video blob to verify client-side liveness check | `FormData` (multipart/form-data) containing `challengeId` and `video` file | `{"passed": true, "confidence": number, "reason": "string"}` | `Connected` / `Stub Fallback` |
| `/api/agent/orchestrate` | `POST` | Triggers the next action block in the AI-driven conversational pipeline | `{"applicationId": "string", "context": {}}` | `{"success": true, "session_id": "string", "next_step": "string"}` | `Stub Fallback` |
| `/api/applications` | `GET` | Fetches all submitted and active applications for dashboard lists | None | `Array` of `Application` objects (see types below) | `Stub Fallback` |
| `/api/applications/{id}` | `GET` | Fetches detailed profile of a single application by unique ID | None (URL Path param) | `Application` object | `Stub Fallback` |
| `/api/applications/{id}/review` | `POST` | Submits officer's manual review action (approve/reject/escalate) | `{"action": "approve" \| "reject", "notes": "string"}` | `{"success": true}` | `Stub Fallback` |

## Model Types

### Application Shape
```typescript
interface Application {
  id: string;
  customerName: string;
  phoneNumber: string;
  status: "pending" | "approved" | "rejected" | "review";
  createdAt: string;
  updatedAt: string;
  income: number;
  loanAmount: number;
  creditScore?: number;
  livenessPassed?: boolean;
  notes?: string;
}
```

---
*Note: For endpoints marked `Stub Fallback`, the frontend custom `apiClient.ts` will perform real network calls, but gracefully fall back to mock payloads if the backend server is not running or hasn't implemented the route yet. This allows Persona B (Frontend) and Persona A (Backend) to work independently.*
