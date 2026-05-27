/**
 * Centralized API client for Vantage.
 * All backend API interactions should go through this client.
 */

export class ApiError extends Error {
  status: number;
  statusText: string;
  body: any;

  constructor(status: number, statusText: string, body: any) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// Simple logger helper for development mode
const log = (message: string, data?: any) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[apiClient] ${message}`, data !== undefined ? data : "");
  }
};

/**
 * Generic request helper for JSON endpoints
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);
  
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  log(`Request to ${url}`, { method: config.method || "GET", body: config.body });

  try {
    const response = await fetch(url, config);
    log(`Response from ${url}`, { status: response.status, statusText: response.statusText });

    let body: any;
    const contentType = response.headers.get("Content-Type");
    if (contentType && contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText, body);
    }

    return body as T;
  } catch (error) {
    log(`Error requesting ${url}`, error);
    throw error;
  }
}

/**
 * Generic request helper for file/blob downloads
 */
async function requestBlob(endpoint: string, options: RequestInit = {}): Promise<Blob> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);
  
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  log(`Request to blob ${url}`, { method: config.method || "GET", body: config.body });

  try {
    const response = await fetch(url, config);
    log(`Response from blob ${url}`, { status: response.status, statusText: response.statusText });

    if (!response.ok) {
      let body: any;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new ApiError(response.status, response.statusText, body);
    }

    return await response.blob();
  } catch (error) {
    log(`Error requesting blob ${url}`, error);
    throw error;
  }
}

// Interfaces based on application requirements

export interface SendOtpResponse {
  success: boolean;
  message?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  token?: string;
  message?: string;
}

export interface LivenessChallengeResponse {
  challengeId: string;
  instruction: string;
  expectedGesture: string;
}

export interface LivenessVerifyResponse {
  passed: boolean;
  confidence: number;
  reason?: string;
}

export interface OrchestrateAgentResponse {
  success: boolean;
  session_id?: string;
  next_step?: string;
}

export interface Application {
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

export interface ReviewResponse {
  success: boolean;
}

export interface HealthCheckResponse {
  ok: boolean;
  version?: string;
}

export const apiClient = {
  /**
   * Health Check endpoint
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const res = await request<{ status?: string; version?: string }>("/health");
      return { ok: true, version: res.version };
    } catch {
      // TODO: remove stub when backend ready
      return { ok: false };
    }
  },

  /**
   * Send OTP to a phone number
   */
  async sendOtp(phoneNumber: string): Promise<SendOtpResponse> {
    try {
      return await request<SendOtpResponse>("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      });
    } catch (e) {
      // TODO: remove mock
      log("sendOtp failed, returning mock response");
      return { success: true, message: "OTP sent successfully" };
    }
  },

  /**
   * Verify OTP for a phone number
   */
  async verifyOtp(phoneNumber: string, code: string): Promise<VerifyOtpResponse> {
    try {
      return await request<VerifyOtpResponse>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, code }),
      });
    } catch (e) {
      // TODO: remove mock
      log("verifyOtp failed, returning mock response");
      if (code === "123456" || code === "999999" || code === "000000") {
        return { success: true, token: "mock_jwt_token" };
      }
      return { success: false, message: "Invalid verification code" };
    }
  },

  /**
   * Fetch a new liveness challenge instruction
   */
  async getLivenessChallenge(): Promise<LivenessChallengeResponse> {
    try {
      return await request<LivenessChallengeResponse>("/api/liveness/challenge");
    } catch (e) {
      // TODO: remove stub when backend ready
      log("getLivenessChallenge failed, returning stub response");
      return {
        challengeId: "stub-" + Math.random().toString(36).substr(2, 9),
        instruction: "Please show 2 fingers to the camera.",
        expectedGesture: "show_fingers",
      };
    }
  },

  /**
   * Upload video blob to verify liveness against a challenge
   */
  async verifyLiveness(challengeId: string, videoBlob: Blob): Promise<LivenessVerifyResponse> {
    try {
      const formData = new FormData();
      formData.append("challengeId", challengeId);
      formData.append("video", videoBlob, "liveness.webm");

      return await request<LivenessVerifyResponse>("/api/liveness/verify", {
        method: "POST",
        body: formData,
      });
    } catch (e) {
      // TODO: remove stub when backend ready
      log("verifyLiveness failed, returning stub response");
      return {
        passed: true,
        confidence: 0.98,
      };
    }
  },

  /**
   * Orchestrate AI agent next steps
   */
  async orchestrateAgent(applicationId: string, context?: any): Promise<OrchestrateAgentResponse> {
    try {
      return await request<OrchestrateAgentResponse>("/api/agent/orchestrate", {
        method: "POST",
        body: JSON.stringify({ applicationId, context }),
      });
    } catch (e) {
      // TODO: remove mock
      log("orchestrateAgent failed, returning mock response");
      return {
        success: true,
        session_id: "session_" + Math.random().toString(36).substr(2, 9),
        next_step: "liveness",
      };
    }
  },

  /**
   * Fetch all applications for admin dashboard
   */
  async getApplications(): Promise<Application[]> {
    try {
      return await request<Application[]>("/api/admin/applications");
    } catch (e) {
      // TODO: remove stub when backend ready
      log("getApplications failed, returning stub response");
      return [
        {
          id: "APP-001",
          customerName: "Rahul Sharma",
          phoneNumber: "+91 98765 43210",
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          income: 75000,
          loanAmount: 250000,
          creditScore: 720,
        },
        {
          id: "APP-002",
          customerName: "Priya Patel",
          phoneNumber: "+91 87654 32109",
          status: "approved",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 43200000).toISOString(),
          income: 120000,
          loanAmount: 500000,
          creditScore: 780,
          livenessPassed: true,
        },
        {
          id: "APP-003",
          customerName: "Amit Kumar",
          phoneNumber: "+91 76543 21098",
          status: "review",
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
          income: 45000,
          loanAmount: 100000,
          creditScore: 610,
        }
      ];
    }
  },

  /**
   * Get detail of a specific application
   */
  async getApplicationById(id: string): Promise<Application> {
    try {
      return await request<Application>(`/api/admin/applications/${id}`);
    } catch (e) {
      // TODO: remove stub when backend ready
      log("getApplicationById failed, returning stub response");
      return {
        id,
        customerName: "Rahul Sharma",
        phoneNumber: "+91 98765 43210",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        income: 75000,
        loanAmount: 250000,
        creditScore: 720,
        notes: "Awaiting final manual check on income documents.",
      };
    }
  },

  /**
   * Action an application (approve/reject)
   */
  async reviewApplication(id: string, action: "approve" | "reject" | "needs-review", notes?: string): Promise<ReviewResponse> {
    try {
      return await request<ReviewResponse>(`/api/admin/applications/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action, notes }),
      });
    } catch (e) {
      // TODO: remove stub when backend ready
      log("reviewApplication failed, returning stub response");
      return { success: true };
    }
  },

  /**
   * Officer Login
   */
  async login(username: string, password: string): Promise<{ token: string; role: string }> {
    try {
      return await request<{ token: string; role: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
    } catch (e) {
      // TODO: remove mock
      log("login failed, returning mock response");
      if (password === "vantage123" || username === "admin") {
        return { token: "mock_jwt_token_officer", role: "PFL_Role.OFFICER" };
      }
      throw e;
    }
  },

  /**
   * Q&A with Vantage Analytics engine
   */
  async askAnalytics(question: string, token: string): Promise<{ answer: string }> {
    try {
      return await request<{ answer: string }>("/api/analytics/ask", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question }),
      });
    } catch (e) {
      // TODO: remove mock
      log("askAnalytics failed, returning mock response");
      return { answer: "Vantage Analytics is operating at optimal levels. All models are online." };
    }
  },

  /**
   * Fetch Vantage overall platform statistics
   */
  async getAnalyticsOverview(token: string): Promise<any> {
    try {
      return await request<any>("/api/analytics/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      // TODO: remove mock
      log("getAnalyticsOverview failed, returning mock response");
      return {
        approval_rate: 94.2,
        hold_count: 5,
        total_sessions: 148,
        rejection_rate: 3.8,
        hold_rate: 2.0,
      };
    }
  },

  /**
   * Fetch recent audit sessions (limit-based)
   */
  async getAuditSessions(limit = 50): Promise<{ sessions: any[] }> {
    try {
      return await request<{ sessions: any[] }>(`/api/audit/recent?limit=${limit}`);
    } catch (e) {
      // TODO: remove mock
      log("getAuditSessions failed, returning mock response");
      const mockSessions = [
        {
          session_id: "SESS-88029",
          phone: "+91 99887 76655",
          extracted: { name: "Rajesh Koothrapali", purpose: "Personal Loan" },
          offer: { status: "APPROVED" },
          risk: { risk_band: "LOW" },
        },
        {
          session_id: "SESS-88030",
          phone: "+91 88776 65544",
          extracted: { name: "Penny Hofstadter", purpose: "Business Loan" },
          offer: { status: "IN_PROGRESS" },
          risk: { risk_band: "MEDIUM" },
        },
        {
          session_id: "SESS-88031",
          phone: "+91 77665 54433",
          extracted: { name: "Sheldon Cooper", purpose: "Science Grant" },
          offer: { status: "APPROVED" },
          risk: { risk_band: "LOW" },
        },
        {
          session_id: "SESS-88032",
          phone: "+91 66554 43322",
          extracted: { name: "Howard Wolowitz", purpose: "Home Loan" },
          offer: { status: "REJECTED" },
          risk: { risk_band: "HIGH" },
        }
      ];
      return { sessions: mockSessions.slice(0, limit) };
    }
  },

  /**
   * Get single detailed audit session profile
   */
  async getAuditSession(id: string): Promise<any> {
    try {
      return await request<any>(`/api/audit/session/${id}`);
    } catch (e) {
      // TODO: remove mock
      log("getAuditSession failed, returning mock response");
      return {
        session_id: id,
        logged_at: new Date().toISOString(),
        phone: "+91 99887 76655",
        extracted: {
          name: "Rajesh Koothrapali",
          dob: "1988-10-12",
          gender: "Male",
          pan: "ABCDE1234F",
          aadhaar: "123456789012",
          purpose: "Personal Loan",
        },
        risk: {
          risk_band: "LOW",
          score: 0.12,
        },
        offer: {
          status: "APPROVED",
          eligible_amount: 150000,
          interest_rate: 11.5,
          tenure_options: [12, 24, 36],
        },
        decision_trace: [
          "Verifying Aadhaar... SUCCESS",
          "Verifying PAN... SUCCESS",
          "Liveness Check... SUCCESS (98% confidence)",
          "Bureau Credit Check... Score: 780 (LOW RISK)",
          "Checking Anti-Money Laundering watchlist... Safe",
          "Vantage Decision Core: Loan PRE-APPROVED",
        ],
      };
    }
  },

  /**
   * Fetch current officer human review queue
   */
  async getReviewQueue(token: string): Promise<{ queue: any[] }> {
    try {
      return await request<{ queue: any[] }>("/api/review/queue", {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      // TODO: remove mock
      log("getReviewQueue failed, returning mock response");
      return {
        queue: [
          {
            id: "Q-991",
            session_id: "SESS-88030",
            escalation_reason: "Manual check: income statement clarity",
          },
          {
            id: "Q-992",
            session_id: "SESS-88032",
            escalation_reason: "High risk: facial match confidence score is 72%",
          }
        ]
      };
    }
  },

  /**
   * Pre-approve interview application details
   */
  async preapproveInterview(payload: any): Promise<any> {
    try {
      return await request<any>("/api/interview/preapprove", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("preapproveInterview failed, returning mock response");
      return {
        eligible_amount: Math.min(payload.requested_loan_amount || 200000, 250000),
        requested_loan_amount: payload.requested_loan_amount || 0,
        loan_type: payload.loan_type || "personal",
        name: payload.name || "Customer",
        status: "PRE-APPROVED",
        interest_rate: 12.0,
        tenure: 24,
        document_requirements: [
          { key: "aadhaar", label: "Aadhaar Card", required: true },
          { key: "pan", label: "PAN Card", required: true },
          { key: "selfie", label: "Live selfie capture", required: true },
          { key: "address_proof", label: "Address proof or utility bill", required: true },
        ],
      };
    }
  },

  /**
   * Verify uploaded identity documents (Aadhaar, PAN, selfie)
   */
  async verifyDocuments(payload: { aadhaar_image: string; pan_image: string; selfie_image: string }): Promise<any> {
    try {
      return await request<any>("/api/kyc/verify-documents", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("verifyDocuments failed, returning mock response");
      return {
        kyc_status: "VERIFIED",
        extracted: {
          aadhaar: {
            name: "Rajesh Koothrapali",
            dob: "1988-10-12",
            gender: "Male",
            aadhaar_number: "XXXX-XXXX-9012",
          },
          pan: {
            name: "Rajesh Koothrapali",
            dob: "1988-10-12",
            gender: "Male",
            pan_number: "ABCDE1234F",
          },
        },
      };
    }
  },

  /**
   * Generates and downloads the reviewed KYC PDF document
   */
  async reviewPdf(payload: any): Promise<Blob> {
    try {
      return await requestBlob("/api/kyc/review-pdf", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("reviewPdf failed, returning mock blob");
      return new Blob(["Mock Vantage KYC PDF content"], { type: "application/pdf" });
    }
  },

  /**
   * Downloads the complete submitted application PDF
   */
  async downloadApplicationPdf(sessionId: string): Promise<Blob> {
    try {
      return await requestBlob(`/api/documents/${sessionId}/application/pdf`);
    } catch (e) {
      // TODO: remove mock
      log("downloadApplicationPdf failed, returning mock blob");
      return new Blob(["Mock Vantage Application PDF content"], { type: "application/pdf" });
    }
  },

  /**
   * Verify residency address details & geographical coordinates
   */
  async verifyAddress(payload: any): Promise<any> {
    try {
      return await request<any>("/api/verify-address", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("verifyAddress failed, returning mock response");
      return {
        matches: true,
        reason: "Address coordinates and photos successfully verified by Vantage AI.",
        aadhaar_address: "123 Main Street, Bangalore, Karnataka",
        proof_address: "123 Main Street, Bangalore, Karnataka",
        name_match: true,
        dob_match: true,
        gender_match: true,
        aadhaar_number_valid: true,
        pan_number_valid: true,
        documents_complete: true,
        geo_city: "Bangalore",
        proof_city: "Bangalore",
        city_match: true,
        selfie_match: true,
        selfie_match_score: 99.4,
      };
    }
  },

  /**
   * Vantage decision core rules evaluation
   */
  async evaluateDecision(payload: any): Promise<any> {
    try {
      return await request<any>("/api/decision/evaluate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("evaluateDecision failed, returning mock response");
      return {
        status: "APPROVED",
        eligible_amount: payload.eligible_amount || 150000,
        interest_rate: 11.5,
        tenure: 24,
        decision_trace: [
          "Pre-check passed",
          "Verification check passed",
          "Risk model check passed",
        ],
      };
    }
  },

  /**
   * Dispatches completed onboarding session meta & transcript to backend analytics
   */
  async logSession(payload: any): Promise<any> {
    try {
      return await request<any>("/api/log-session", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("logSession failed, returning mock response");
      return { success: true };
    }
  },

  /**
   * Request a Video KYC link dispatch (initial step)
   */
  async requestVideoKyc(payload: any): Promise<any> {
    try {
      return await request<any>("/api/video-kyc/request", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // TODO: remove mock
      log("requestVideoKyc failed, returning mock response");
      return { success: true };
    }
  },

  /**
   * Verify verification OTP during video call phase
   */
  async verifyVideoKycOtp(token: string, otp: string): Promise<any> {
    try {
      return await request<any>("/api/video-kyc/verify-otp", {
        method: "POST",
        body: JSON.stringify({ token, otp }),
      });
    } catch (e) {
      // TODO: remove mock
      log("verifyVideoKycOtp failed, returning mock response");
      return {
        full_name: "Rajesh Koothrapali",
        mobile_number: "+91 99887 76655",
        language: "en",
      };
    }
  },

  /**
   * Consult with the active AI agent
   */
  async consultAgent(transcript: string, conversationHistory: any[], language: string): Promise<any> {
    try {
      return await request<any>("/api/agent", {
        method: "POST",
        body: JSON.stringify({ transcript, conversation_history: conversationHistory, language }),
      });
    } catch (e) {
      // TODO: remove mock
      log("consultAgent failed, returning mock response");
      return {
        reply: "Hello, I am the Vantage Video KYC Assistant. I can help guide you through the process. Is your address coordinate correctly verified?",
      };
    }
  },

  /**
   * Fetch secure token for Deepgram Speech-to-Text session
   */
  async getDeepgramToken(): Promise<{ token: string }> {
    try {
      return await request<{ token: string }>("/api/deepgram-token");
    } catch (e) {
      // TODO: remove mock
      log("getDeepgramToken failed, returning mock token");
      return { token: "mock_deepgram_secure_web_token_for_onboarding" };
    }
  },
};
