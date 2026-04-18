"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FileCheck2, FileSearch, FolderSearch, ShieldCheck, Moon, Sun } from "lucide-react";
import TranscriptPanel from "../../components/TranscriptPanel";
import OfferCard from "@/components/OfferCard";
import { LumaSpin } from "@/components/ui/luma-spin";
import { AnimatedDownload } from "@/components/ui/animated-download";
import { Waves } from "@/components/ui/wave-background";
import { IconContainer, Radar } from "@/components/ui/radar-effect";
import { connectDeepgramStt } from "@/lib/sttService";
import { translations, Language } from "@/lib/translations";
import VantageLoader from "@/components/ui/vantage-loader";
import { useScroll } from "@/components/ui/use-scroll";

const TTS_LANG_MAP: Record<string, string> = { en: "en-US", hi: "hi-IN", mr: "mr-IN" };
const LANGUAGE_OPTIONS: { code: Language; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
];

const LIVENESS_COPY: Record<Language, { showTwo: string; showThree: string; ack: string; verified: string }> = {
  en: {
    showTwo: "Before we continue, please show 2 fingers to the camera.",
    showThree: "Great. Now please show 3 fingers to the camera.",
    ack: "Gesture received. Processing...",
    verified: "Perfect. Liveness check verified. Let us continue.",
  },
  hi: {
    showTwo: "आगे बढ़ने से पहले, कृपया कैमरे की ओर 2 उंगलियां दिखाएं।",
    showThree: "बहुत अच्छा। अब कृपया कैमरे की ओर 3 उंगलियां दिखाएं।",
    ack: "जेस्चर प्राप्त हुआ। प्रोसेस किया जा रहा है...",
    verified: "सत्यापन सफल रहा। अब हम आगे बढ़ते हैं।",
  },
  mr: {
    showTwo: "पुढे जाण्यापूर्वी कृपया कॅमेऱ्यासमोर 2 बोटे दाखवा.",
    showThree: "छान. आता कृपया कॅमेऱ्यासमोर 3 बोटे दाखवा.",
    ack: "जेस्चर मिळाला. प्रक्रिया सुरू आहे...",
    verified: "छान. लायव्हनेस पडताळणी पूर्ण झाली. आता पुढे जाऊया.",
  },
};

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp?: string;
}

type CallPhase =
  | "connecting"
  | "conversation"
  | "analyzing"
  | "kyc-upload"
  | "preapproval-review"
  | "loan-docs"
  | "offer"
  | "error";

type DocumentRequirement = {
  key: string;
  label: string;
  required?: boolean;
};

interface PreapprovalData {
  name: string;
  employment_type: string;
  monthly_income: number;
  loan_type: string;
  requested_loan_amount: number;
  declared_age?: number;
  eligible_amount: number;
  eligible_min: number;
  eligible_max: number;
  document_requirements?: DocumentRequirement[];
  policy_summary?: Record<string, unknown>;
  message: string;
}

interface FinalDecision {
  decision_status: "APPROVED" | "REJECTED" | "HOLD";
  final_approved_amount: number;
  interest_rate: number;
  tenure_options: number[];
  reason: string;
  risk_flag: string;
}

interface KycDocVerifyResult {
  kyc_status: "VERIFIED" | "FAILED";
  reason: string;
  name_match?: boolean;
  dob_match?: boolean;
  gender_match?: boolean;
  aadhaar_number_valid?: boolean;
  pan_number_valid?: boolean;
  selfie_match_score?: number | null;
  selfie_match?: boolean | null;
  aadhaar_photo_base64?: string | null;
  extracted?: {
    aadhaar?: Record<string, unknown>;
    pan?: Record<string, unknown>;
  };
}

interface EditableKycData {
  applicant_name: string;
  aadhaar_number: string;
  pan_number: string;
  dob: string;
  gender: string;
}

function prettifyLoanType(loanType: string) {
  return loanType
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function explainDecisionReason(reason: string) {
  const normalized = (reason || "").trim().toUpperCase();
  const knownReasons: Record<string, string> = {
    KYC_NOT_VERIFIED: "KYC checks could not be fully verified with the submitted evidence.",
    HIGH_RISK: "The risk engine flagged this application as high risk.",
    POLICY_MISMATCH: "The application did not satisfy one or more policy rules.",
    DOCUMENTS_INCOMPLETE: "Required supporting documents were incomplete.",
    INCOME_INSUFFICIENT: "Verified income was below policy requirement for the requested amount.",
  };

  if (knownReasons[normalized]) return knownReasons[normalized];

  if (!reason) return "The decision engine returned a non-specific reason.";

  const cleaned = reason
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  return `${cleaned}.`;
}

function uniqueUrls(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function CallPageInner() {
  const searchParams = useSearchParams();
  const roomUrl = searchParams.get("room") || "";
  const phone = searchParams.get("phone") || "";
  const campaignId = searchParams.get("campaign_id") || "";
  const campaignLink = searchParams.get("campaign_link") || "";
  const leadId = searchParams.get("lead_id") || "";
  const kycToken = searchParams.get("kyc_token") || "";
  const initialLang = searchParams.get("lang") || "en";
  const [activeLanguage, setActiveLanguage] = useState<Language>(
    (["en", "hi", "mr"].includes(initialLang) ? initialLang : "en") as Language
  );
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const t = translations[activeLanguage] || translations.en;
  const scrolled = useScroll(10);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTranscriptRef = useRef<string>("");

  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [isOtpVerified, setIsOtpVerified] = useState(!kycToken);
  const [isLanguageConfirmed, setIsLanguageConfirmed] = useState(!kycToken);
  const [isPreCallConsentAccepted, setIsPreCallConsentAccepted] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [verifiedSession, setVerifiedSession] = useState<{ full_name: string; mobile_number: string; language: string } | null>(null);
  /** Set when getUserMedia succeeds — drives video element + STT (refs miss first paint while still on "connecting"). */
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [sttStatus, setSttStatus] = useState<"idle" | "connecting" | "live" | "failed">("idle");
  const [offerData] = useState<Record<string, unknown> | null>(null);
  const [riskSnapshot] = useState<Record<string, unknown> | null>(null);
  const [customerSnapshot, setCustomerSnapshot] = useState<Record<string, unknown> | null>(null);
  const [processingStep, setProcessingStep] = useState("");
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isVerifyingKycDocs, setIsVerifyingKycDocs] = useState(false);
  const [kycAadhaarFile, setKycAadhaarFile] = useState<File | null>(null);
  const [kycPanFile, setKycPanFile] = useState<File | null>(null);
  const [kycAadhaarImageData, setKycAadhaarImageData] = useState<string | null>(null);
  const [kycPanImageData, setKycPanImageData] = useState<string | null>(null);
  const [kycVerifyResult, setKycVerifyResult] = useState<KycDocVerifyResult | null>(null);
  const [editableKycData, setEditableKycData] = useState<EditableKycData>({
    applicant_name: "",
    aadhaar_number: "",
    pan_number: "",
    dob: "",
    gender: "",
  });
  const [isGeneratingKycPdf, setIsGeneratingKycPdf] = useState(false);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [extraDocuments, setExtraDocuments] = useState<Record<string, File | null>>({});
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [locationData, setLocationData] = useState<{ latitude: number; longitude: number } | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [agentNotice, setAgentNotice] = useState("");
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState("");
  const [preapproval, setPreapproval] = useState<PreapprovalData | null>(null);
  const [finalDecision, setFinalDecision] = useState<FinalDecision | null>(null);
  const [sessionDropped, setSessionDropped] = useState(false);
  const sessionDropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<CallPhase>("connecting");
  const [addressCheck, setAddressCheck] = useState<{
    aadhaar_address?: string;
    proof_address?: string;
    matches: boolean;
    reason: string;
    name_match?: boolean;
    dob_match?: boolean;
    gender_match?: boolean;
    aadhaar_number_valid?: boolean;
    pan_number_valid?: boolean;
    blood_group?: string | null;
    proof_city?: string | null;
    geo_city?: string | null;
    city_match?: boolean | null;
    aadhaar_photo_base64?: string | null;
    pan_photo_base64?: string | null;
    selfie_match_score?: number | null;
    selfie_match?: boolean | null;
    pan_has_address?: boolean | null;
    required_documents?: string[];
    documents_complete?: boolean;
    missing_required_documents?: string[];
  } | null>(null);
  const [addressCheckError, setAddressCheckError] = useState("");
  const [showKycLoadingScreen, setShowKycLoadingScreen] = useState(false);
  const [kycLoadingComplete, setKycLoadingComplete] = useState(false);
  const [showPreapprovalLoadingScreen, setShowPreapprovalLoadingScreen] = useState(false);
  const [preapprovalLoadingComplete, setPreapprovalLoadingComplete] = useState(false);
  const [showOfferLoadingScreen, setShowOfferLoadingScreen] = useState(false);
  const [offerLoadingComplete, setOfferLoadingComplete] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isLivenessVerified, setIsLivenessVerified] = useState(false);
  const [livenessPhase, setLivenessPhase] = useState<"idle" | "show-2" | "ack-2" | "show-3" | "ack-3" | "verified">("idle");
  const [livenessText, setLivenessText] = useState("");
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [isDownloadAnimating, setIsDownloadAnimating] = useState(false);
  const [pendingDownloadType, setPendingDownloadType] = useState<"kyc" | "application" | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const sessionStartedAtRef = useRef<string>(new Date().toISOString());
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`,
  );
  const sttCloseRef = useRef<(() => void) | null>(null);
  const sttConnRef = useRef<import("@/lib/sttService").DeepgramSttConnection | null>(null);
  const speakingIdRef = useRef(0);
  /** Must not put conversationHistory in sendToAgent deps — it would change every reply and re-run the STT effect (Deepgram reconnect + sendToAgent("") loop). */
  const conversationHistoryRef = useRef<{ role: string; content: string }[]>([]);
  const initialGreetingRequestedRef = useRef(false);
  const agentRateLimitedUntilRef = useRef<number>(0);
  const livenessStartedRef = useRef(false);
  const livenessTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const configuredBackend = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const backendCandidates = uniqueUrls([
    configuredBackend,
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8000",
  ]);
  const fetchBaseCandidates = uniqueUrls([
    "",
    configuredBackend,
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8000",
  ]);
  const BACKEND = backendCandidates[0] || "http://127.0.0.1:8001";
  const effectivePhone = verifiedSession?.mobile_number || phone;

  const buildApiUrl = (baseUrl: string, path: string) => {
    if (!baseUrl) return path;
    return `${baseUrl.replace(/\/+$/, "")}${path}`;
  };

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchWithBackendFallback = async (path: string, options: RequestInit = {}, timeoutMs = 12000) => {
    let lastError: unknown = null;
    for (const baseUrl of fetchBaseCandidates) {
      try {
        const res = await fetchWithTimeout(buildApiUrl(baseUrl, path), options, timeoutMs);
        return { res, baseUrl };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Backend not reachable");
  };

  const getTimestamp = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const currentLoanType = preapproval?.loan_type || "personal";
  const currentLoanLabel = prettifyLoanType(currentLoanType);
  const documentRequirements = preapproval?.document_requirements || [
    { key: "aadhaar", label: "Aadhaar Card", required: true },
    { key: "pan", label: "PAN Card", required: true },
    { key: "selfie", label: "Live selfie capture", required: true },
    { key: "address_proof", label: "Address proof or utility bill", required: true },
  ];
  const loanDocumentRequirements = documentRequirements.filter((doc) => !["aadhaar", "pan", "selfie"].includes(doc.key));

  useEffect(() => {
    const savedTheme = localStorage.getItem("vantage-theme");
    if (savedTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("vantage-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("vantage-theme", next);
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read file"));
      };
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });

  const handleVerifyLinkOtp = async () => {
    if (!kycToken) {
      setIsOtpVerified(true);
      return;
    }
    if (otpInput.trim().length !== 6) {
      setOtpError("Please enter a valid 6-digit OTP");
      return;
    }
    setOtpError("");
    setOtpVerifying(true);
    try {
      const { res } = await fetchWithBackendFallback("/api/video-kyc/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: kycToken, otp: otpInput.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.detail || "OTP verification failed");
      }
      setVerifiedSession({
        full_name: String(payload.full_name || ""),
        mobile_number: String(payload.mobile_number || ""),
        language: String(payload.language || activeLanguage),
      });
      const payloadLanguage = String(payload.language || activeLanguage);
      if (["en", "hi", "mr"].includes(payloadLanguage)) {
        setActiveLanguage(payloadLanguage as Language);
      }
      setIsOtpVerified(true);
      if (kycToken) setIsLanguageConfirmed(false);
      setIsPreCallConsentAccepted(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to verify OTP";
      setOtpError(message);
    } finally {
      setOtpVerifying(false);
    }
  };

  const stopMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);
    setIsMicMuted(false);
    setIsCameraOff(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleToggleMic = useCallback(() => {
    setIsMicMuted((current) => {
      const next = !current;
      sttConnRef.current?.setMuted(next);
      mediaStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const handleToggleCamera = useCallback(() => {
    setIsCameraOff((current) => {
      const next = !current;
      mediaStreamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const handleEndCall = useCallback(() => {
    stopMediaStream();
    window.location.href = "/";
  }, [stopMediaStream]);

  const clearLivenessTimers = useCallback(() => {
    livenessTimersRef.current.forEach((timer) => clearTimeout(timer));
    livenessTimersRef.current = [];
  }, []);

  const handleConfirmLanguage = () => {
    setVerifiedSession((prev) => {
      if (!prev) return prev;
      return { ...prev, language: activeLanguage };
    });
    setIsPreCallConsentAccepted(false);
    setIsLanguageConfirmed(true);
  };

  // ── 1. Initialize camera + mic ─────────────────────────────
  useEffect(() => {
    if (!isOtpVerified || !isLanguageConfirmed || !isPreCallConsentAccepted) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    const mediaAttempts: MediaStreamConstraints[] = [
      { video: { facingMode: "user" }, audio: true },
      { video: true, audio: true },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false },
    ];

    const describeMediaError = (err: unknown) => {
      const mediaErr = err as DOMException | undefined;
      const detail = mediaErr?.name ? ` (${mediaErr.name}${mediaErr.message ? `: ${mediaErr.message}` : ""})` : "";

      if (typeof window !== "undefined" && !window.isSecureContext) {
        return `Camera access needs HTTPS or localhost.${detail}`;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        return `Camera API unavailable in this browser/session.${detail}`;
      }

      if (mediaErr?.name === "NotAllowedError") {
        return `Camera or microphone permission was denied. Please allow access in browser settings.${detail}`;
      }
      if (mediaErr?.name === "NotFoundError") {
        return `No camera was detected. Connect a camera and try again.${detail}`;
      }
      if (mediaErr?.name === "NotReadableError") {
        return `Camera is in use by another app. Close it and retry.${detail}`;
      }
      if (mediaErr?.name === "OverconstrainedError") {
        return `Camera constraints are unsupported on this device. Retrying with relaxed settings failed.${detail}`;
      }
      if (mediaErr?.name === "SecurityError") {
        return `Browser blocked media access due to security policy.${detail}`;
      }

      return `Unable to access camera right now. Please retry.${detail}`;
    };

    (async () => {
      try {
        setCameraError("");
        setAgentNotice("");

        if (typeof window !== "undefined" && !window.isSecureContext) {
          throw new DOMException("Insecure context", "SecurityError");
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("mediaDevices.getUserMedia is unavailable", "NotSupportedError");
        }

        let lastAttemptError: unknown = null;
        for (const constraints of mediaAttempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            const usingAudio = constraints.audio === true;
            if (!usingAudio) {
              setAgentNotice("Microphone unavailable - use text input if voice is not captured.");
            }
            break;
          } catch (attemptErr) {
            lastAttemptError = attemptErr;
          }
        }

        if (!stream) {
          throw lastAttemptError || new Error("Unable to initialize media stream");
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        setMediaStream(stream);
        setIsMicMuted(false);
        setIsCameraOff(false);
        setPhase("conversation");
      } catch (err: unknown) {
        setCameraError(describeMediaError(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      stopMediaStream();
    };
  }, [isOtpVerified, isLanguageConfirmed, isPreCallConsentAccepted, stopMediaStream]);

  // ── 1b. Bind stream to <video> (element only exists after phase → conversation) ──
  useLayoutEffect(() => {
    if (!mediaStream || (phase !== "conversation" && phase !== "analyzing")) return;
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = mediaStream;
    el.play().catch(() => {});
  }, [mediaStream, phase]);

  // ── 2. Capture geolocation ────────────────────────────────
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== "conversation") {
      if (sessionDropTimerRef.current) clearTimeout(sessionDropTimerRef.current);
      setSessionDropped(false);
      clearLivenessTimers();
      setLivenessPhase("idle");
      setLivenessText("");
      setIsLivenessVerified(false);
      livenessStartedRef.current = false;
      initialGreetingRequestedRef.current = false;
    }
  }, [phase, clearLivenessTimers]);

  useEffect(() => {
    if (phase !== "conversation" || livenessStartedRef.current) return;
    livenessStartedRef.current = true;

    const script = LIVENESS_COPY[activeLanguage] || LIVENESS_COPY.en;
    setAgentNotice("Running quick liveness check...");

    setLivenessPhase("show-2");
    setLivenessText(script.showTwo);
    setMessages((prev) => [...prev, { role: "agent", content: script.showTwo, timestamp: getTimestamp() }]);

    livenessTimersRef.current.push(setTimeout(() => {
      setLivenessPhase("ack-2");
      setLivenessText(script.ack);
    }, 3000));

    livenessTimersRef.current.push(setTimeout(() => {
      setLivenessPhase("show-3");
      setLivenessText(script.showThree);
      setMessages((prev) => [...prev, { role: "agent", content: script.showThree, timestamp: getTimestamp() }]);
    }, 4200));

    livenessTimersRef.current.push(setTimeout(() => {
      setLivenessPhase("ack-3");
      setLivenessText(script.ack);
    }, 7200));

    livenessTimersRef.current.push(setTimeout(() => {
      setLivenessPhase("verified");
      setLivenessText(script.verified);
      setMessages((prev) => [...prev, { role: "agent", content: script.verified, timestamp: getTimestamp() }]);
      setAgentNotice("");
      setIsLivenessVerified(true);
    }, 9000));

    livenessTimersRef.current.push(setTimeout(() => {
      setLivenessPhase("idle");
      setLivenessText("");
    }, 10400));
  }, [phase, activeLanguage]);

  // Handle KYC loading screen: show for 5 seconds when kyc-upload phase starts
  useEffect(() => {
    if (phase === "kyc-upload") {
      setShowKycLoadingScreen(true);
      setKycLoadingComplete(false);
      const timer = setTimeout(() => {
        setShowKycLoadingScreen(false);
        setKycLoadingComplete(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Handle Preapproval loading screen: show for 5 seconds when preapproval-review phase starts
  useEffect(() => {
    if (phase === "preapproval-review") {
      setShowPreapprovalLoadingScreen(true);
      setPreapprovalLoadingComplete(false);
      const timer = setTimeout(() => {
        setShowPreapprovalLoadingScreen(false);
        setPreapprovalLoadingComplete(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Handle final decision loading screen: show for 5 seconds when offer phase starts
  useEffect(() => {
    if (phase === "offer") {
      setShowOfferLoadingScreen(true);
      setOfferLoadingComplete(false);
      const timer = setTimeout(() => {
        setShowOfferLoadingScreen(false);
        setOfferLoadingComplete(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Change 4: Monitor video track for session drop ──
  useEffect(() => {
    if (!mediaStream) return;
    const videoTrack = mediaStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const onEnded = () => {
      if (phaseRef.current !== "conversation") return;
      if (sessionDropTimerRef.current) clearTimeout(sessionDropTimerRef.current);
      sessionDropTimerRef.current = setTimeout(() => {
        // Guard against false positives: only interrupt if the video track is still ended.
        const stream = mediaStreamRef.current;
        const activeVideoTrack = stream?.getVideoTracks?.()[0];
        const isVideoGone = !stream || !activeVideoTrack || activeVideoTrack.readyState === "ended";
        if (phaseRef.current === "conversation" && isVideoGone) {
          setSessionDropped(true);
        }
      }, 5000);
    };
    videoTrack.addEventListener("ended", onEnded);
    return () => {
      videoTrack.removeEventListener("ended", onEnded);
      if (sessionDropTimerRef.current) clearTimeout(sessionDropTimerRef.current);
    };
  }, [mediaStream]);

  const isLikelyBlankCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const { width, height } = canvas;
    if (width < 2 || height < 2) return true;
    const sample = ctx.getImageData(0, 0, Math.min(width, 64), Math.min(height, 64)).data;
    let total = 0;
    let pixels = 0;
    for (let i = 0; i < sample.length; i += 4) {
      total += sample[i] + sample[i + 1] + sample[i + 2];
      pixels += 1;
    }
    const avg = pixels > 0 ? total / (pixels * 3) : 0;
    return avg < 4;
  };

  const captureSelfie = useCallback(async (): Promise<string | null> => {
    const stream = mediaStreamRef.current;

    // Prefer direct camera frame capture when available (more reliable than video element timing).
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const ImageCaptureCtor = (window as Window & { ImageCapture?: any }).ImageCapture;
          if (ImageCaptureCtor) {
            const imageCapture = new ImageCaptureCtor(videoTrack);
            const bitmap = await imageCapture.grabFrame();
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width || 640;
            canvas.height = bitmap.height || 480;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0);
              if (!isLikelyBlankCanvas(canvas)) {
                return canvas.toDataURL("image/jpeg", 0.85);
              }
            }
          }
        } catch {
          // fallback below
        }
      }
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    if (isLikelyBlankCanvas(canvas)) return null;
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  // ── 3. Post-conversation pipeline (declared before STT / agent) ──
  const handleConversationComplete = useCallback(
    async (customerInput: Record<string, unknown>) => {
      setPhase("analyzing");
      setJourneyError("");

      try {
        const interviewPayload = {
          name: String(customerInput.name || ""),
          employment_type: String(customerInput.employment_type || customerInput.employment || ""),
          monthly_income: Number(customerInput.monthly_income || customerInput.income || 0),
          loan_type: String(customerInput.loan_type || customerInput.purpose || customerInput.loan_purpose || "personal"),
          requested_loan_amount: Number(customerInput.requested_loan_amount || customerInput.requested_amount || 0),
          declared_age: Number(customerInput.declared_age || customerInput.age || 0),
        };

        setProcessingStep("Generating pre-approval...");
        const preRes = await fetch(`${BACKEND}/api/interview/preapprove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(interviewPayload),
        });
        if (!preRes.ok) throw new Error("Failed to generate pre-approval");

        const pre = (await preRes.json()) as PreapprovalData;
        const requestedAmount = Number(pre.requested_loan_amount || interviewPayload.requested_loan_amount || 0);
        const normalizedEligible = Number(pre.eligible_amount || 0);
        const cappedEligibleAmount = requestedAmount > 0
          ? Math.min(normalizedEligible, requestedAmount)
          : normalizedEligible;

        setPreapproval({
          ...pre,
          requested_loan_amount: requestedAmount,
          eligible_amount: cappedEligibleAmount,
        });
        setCustomerSnapshot({ interview: interviewPayload });

        // Block if consent is false
        const consentGiven = Boolean(customerInput.consent);
        if (!consentGiven) {
          setJourneyError("Document verification cannot proceed without consent as required by RBI guidelines.");
          setPhase("error");
          return;
        }

        let selfie: string | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          selfie = await captureSelfie();
          if (selfie) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (selfie) {
          setCapturedSelfie(selfie);
        } else {
          setJourneyError("Unable to capture a clear selfie frame from the call. Please restart the session and keep your face centered when call ends.");
        }
        stopMediaStream();
        setPhase("kyc-upload");
      } catch {
        setPhase("error");
      }
    },
    [BACKEND, captureSelfie, stopMediaStream],
  );

  // ── 4. Send transcript to agent (stable callback — uses ref for history) ──
  const sendToAgent = useCallback(async (text: string) => {
    if (!isLivenessVerified && text.trim()) {
      setAgentNotice("Please complete the liveness check first.");
      return;
    }
    try {
      if (Date.now() < agentRateLimitedUntilRef.current) {
        return;
      }

      // Show "AI is thinking" indicator
      setIsWaitingForAI(true);
      const startTime = Date.now();

      const history = conversationHistoryRef.current;
      const { res } = await fetchWithBackendFallback("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, conversation_history: history, language: activeLanguage }),
      });
      
      const responseTime = Date.now() - startTime;
      setIsWaitingForAI(false);

      if (!res.ok) {
        const detail = await res
          .json()
          .then((d) => String(d?.detail || ""))
          .catch(() => "");

        if (res.status === 429) {
          agentRateLimitedUntilRef.current = Date.now() + 30000;
          const notice = "AI service is temporarily rate-limited. Retrying shortly. You can continue speaking or use text.";
          setAgentNotice(notice);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "agent" && last.content === notice) return prev;
            return [...prev, { role: "agent", content: notice, timestamp: getTimestamp() }];
          });
          return;
        }

        if (detail) {
          setAgentNotice(detail);
        }
        return;
      }

      setAgentNotice("");
      const data = await res.json();

      const userTurn = text.trim();
      const newHistory = userTurn
        ? [...history, { role: "user", content: text }, { role: "assistant", content: data.message }]
        : [...history, { role: "assistant", content: data.message }];

      conversationHistoryRef.current = newHistory;

      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.message, timestamp: getTimestamp() },
      ]);

      // Speak agent response using browser TTS
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const currentSpeakingId = ++speakingIdRef.current;
        const speechWindow = window as Window & { _utterances?: SpeechSynthesisUtterance[] };
        
        sttConnRef.current?.setMuted(true);
        
        const utterance = new SpeechSynthesisUtterance(data.message);
        utterance.rate = 1;
        utterance.pitch = 1;
        const ttsLang = TTS_LANG_MAP[activeLanguage] || "en-IN";
        utterance.lang = ttsLang;

        const voices = window.speechSynthesis.getVoices();
        const voiceByLang = voices.find((v) => v.lang.toLowerCase().startsWith(ttsLang.toLowerCase().split("-")[0]));
        if (voiceByLang) {
          utterance.voice = voiceByLang;
        }

        // Prevent GC of utterance before onend fires
        speechWindow._utterances = speechWindow._utterances || [];
        speechWindow._utterances.push(utterance);
        
        const cleanup = () => {
          setTimeout(() => {
            if (speakingIdRef.current === currentSpeakingId) {
              sttConnRef.current?.setMuted(false);
            }
          }, 300);
          speechWindow._utterances = (speechWindow._utterances || []).filter((u) => u !== utterance);
        };
        
        utterance.onend = cleanup;
        utterance.onerror = cleanup;
        
        window.speechSynthesis.speak(utterance);
      }

      if (data.done && data.data) {
        handleConversationComplete(data.data);
      }
    } catch {
      // Reset waiting state on error
      setIsWaitingForAI(false);
      // silently fail — will retry on next interval
    }
  }, [handleConversationComplete, activeLanguage, isLivenessVerified]);

  useEffect(() => {
    if (phase !== "conversation" || !isLivenessVerified) return;
    if (initialGreetingRequestedRef.current) return;
    initialGreetingRequestedRef.current = true;
    const timer = setTimeout(() => void sendToAgent(""), 700);
    return () => clearTimeout(timer);
  }, [phase, isLivenessVerified, sendToAgent]);

  const handleQuickReply = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!isLivenessVerified) {
        setAgentNotice("Please complete the liveness check first.");
        return;
      }
      setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: getTimestamp() }]);
      sendToAgent(trimmed);
    },
    [sendToAgent, isLivenessVerified],
  );

  // ── 5. Connect Deepgram STT (via sttService) ───────────────
  useEffect(() => {
    if (phase !== "conversation" || !mediaStream) return;

    let cancelled = false;
    setSttStatus("connecting");

    (async () => {
      try {
        const { res: tokenRes } = await fetchWithBackendFallback("/api/deepgram-token", {}, 8000);
        if (!tokenRes.ok) {
          setSttStatus("failed");
          return;
        }
        const { token } = await tokenRes.json();
        if (cancelled || !token) {
          setSttStatus("failed");
          return;
        }

        const conn = connectDeepgramStt(token, mediaStream, {
          onOpen: () => {
            setSttStatus("live");
            if (sessionDropTimerRef.current) {
              clearTimeout(sessionDropTimerRef.current);
              sessionDropTimerRef.current = null;
            }
            setSessionDropped(false);
          },
          onError: () => setSttStatus("failed"),
          onClose: () => {
            // STT socket can close transiently; do not hard-stop the session for this.
            if (phaseRef.current !== "conversation") return;
            setAgentNotice("Voice connection interrupted. Please continue speaking or use text.");
          },
          onListeningChange: (v) => setIsListening(v),
          onFinalTranscript: (transcript) => {
            if (!isLivenessVerified) return;
            if (!transcript.trim()) return;
            setMessages((prev) => [
              ...prev,
              { role: "user", content: transcript, timestamp: getTimestamp() },
            ]);
            pendingTranscriptRef.current += ` ${transcript}`;
          },
          onInterim: (t) => setInterimText(t),
          onUtteranceEnd: () => {
            if (!isLivenessVerified) return;
            const accumulated = pendingTranscriptRef.current.trim();
            if (accumulated) {
              pendingTranscriptRef.current = "";
              void sendToAgent(accumulated);
            }
          },
        }, activeLanguage);

        sttCloseRef.current = conn.close;
        sttConnRef.current = conn;

        agentTimerRef.current = setInterval(() => {
          if (!isLivenessVerified) return;
          const accumulated = pendingTranscriptRef.current.trim();
          if (accumulated) {
            pendingTranscriptRef.current = "";
            void sendToAgent(accumulated);
          }
        }, 8000);
      } catch {
        setSttStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      setSttStatus("idle");
      sttCloseRef.current?.();
      sttCloseRef.current = null;
      sttConnRef.current = null;
      if (agentTimerRef.current) clearInterval(agentTimerRef.current);
    };
  }, [phase, mediaStream, sendToAgent, activeLanguage, isLivenessVerified]);

  // ── Manual text input fallback ────────────────────────────
  const handleManualSend = () => {
    if (!manualInput.trim()) return;
    if (!isLivenessVerified) {
      setAgentNotice("Please complete the liveness check first.");
      return;
    }
    setMessages((prev) => [...prev, { role: "user", content: manualInput, timestamp: getTimestamp() }]);
    sendToAgent(manualInput);
    setManualInput("");
  };

  const handleVerifyKycDocuments = async () => {
    if (!kycAadhaarFile || !kycPanFile || !capturedSelfie) {
      setJourneyError("Upload Aadhaar and PAN, and ensure selfie was captured from call.");
      return;
    }
    setJourneyError("");
    setIsVerifyingKycDocs(true);
    try {
      const [aadhaarImage, panImage] = await Promise.all([
        fileToDataUrl(kycAadhaarFile),
        fileToDataUrl(kycPanFile),
      ]);
      setKycAadhaarImageData(aadhaarImage);
      setKycPanImageData(panImage);

      const res = await fetch(`${BACKEND}/api/kyc/verify-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aadhaar_image: aadhaarImage,
          pan_image: panImage,
          selfie_image: capturedSelfie,
        }),
      });
      const data = (await res.json()) as KycDocVerifyResult;
      setKycVerifyResult(data);

      if (!res.ok || data.kyc_status !== "VERIFIED") {
        setJourneyError(data.reason || "KYC verification failed. Please upload clearer Aadhaar/PAN images.");
        return;
      }

      setEditableKycData({
        applicant_name: String(data.extracted?.aadhaar?.name || data.extracted?.pan?.name || preapproval?.name || ""),
        aadhaar_number: String(data.extracted?.aadhaar?.aadhaar_number || ""),
        pan_number: String(data.extracted?.pan?.pan_number || ""),
        dob: String(data.extracted?.aadhaar?.dob || data.extracted?.pan?.dob || ""),
        gender: String(data.extracted?.aadhaar?.gender || data.extracted?.pan?.gender || ""),
      });
      setPhase("preapproval-review");
    } catch {
      setJourneyError("Unable to verify KYC documents right now.");
    } finally {
      setIsVerifyingKycDocs(false);
    }
  };

  const downloadKycPdf = async () => {
    if (!preapproval) return;
    setIsGeneratingKycPdf(true);
    try {
      const res = await fetch(`${BACKEND}/api/kyc/review-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editableKycData,
          loan_type: preapproval.loan_type,
          preapproved_amount: preapproval.eligible_amount,
          selfie_image: capturedSelfie,
          session_id: sessionIdRef.current,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate KYC PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sessionIdRef.current}-kyc-review.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setJourneyError("Could not generate KYC PDF right now.");
    } finally {
      setIsGeneratingKycPdf(false);
    }
  };

  const downloadApplicationPdf = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/documents/${sessionIdRef.current}/application/pdf`);
      if (!res.ok) throw new Error("Failed to generate application PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sessionIdRef.current}-application.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setJourneyError("Could not generate final application PDF right now.");
    }
  };

  const handleDownloadKycPdf = () => {
    if (!preapproval || isGeneratingKycPdf || isDownloadAnimating) return;
    setPendingDownloadType("kyc");
    setShowDownloadPopup(true);
    setIsDownloadAnimating(true);
  };

  const handleDownloadApplicationPdf = () => {
    if (isDownloadAnimating) return;
    setPendingDownloadType("application");
    setShowDownloadPopup(true);
    setIsDownloadAnimating(true);
  };

  const handleDownloadAnimationComplete = () => {
    setIsDownloadAnimating(false);
    void (async () => {
      if (pendingDownloadType === "kyc") {
        await downloadKycPdf();
      } else if (pendingDownloadType === "application") {
        await downloadApplicationPdf();
      }
      setPendingDownloadType(null);
      setShowDownloadPopup(false);
    })();
  };

  const handleProceedAfterKycReview = () => {
    if (!kycVerifyResult || kycVerifyResult.kyc_status !== "VERIFIED") {
      setJourneyError("Complete KYC verification before continuing.");
      return;
    }
    setPhase("loan-docs");
  };

  const handleGoToPreviousStep = () => {
    if (phase === "preapproval-review") {
      setPhase("kyc-upload");
      return;
    }
    if (phase === "loan-docs") {
      setPhase("preapproval-review");
      return;
    }
    if (phase === "offer") {
      setPhase("loan-docs");
    }
  };

  const handleDocumentSubmit = async () => {
    if (!addressFile || !preapproval || !capturedSelfie || !kycAadhaarImageData || !kycPanImageData) return;
    setJourneyError("");
    setAddressCheck(null);
    setAddressCheckError("");
    setIsUploadingDocs(true);
    setJourneyLoading(true);
    try {
      const requiredDocumentKeys = (documentRequirements || [])
        .filter((doc) => doc.required !== false)
        .map((doc) => doc.key);

      const uploadedDocumentKeys = [
        ...(kycAadhaarImageData ? ["aadhaar"] : []),
        ...(kycPanImageData ? ["pan"] : []),
        ...(addressFile ? ["address_proof"] : []),
        ...(capturedSelfie ? ["selfie"] : []),
        ...Object.entries(extraDocuments)
          .filter(([, file]) => Boolean(file))
          .map(([key]) => key),
      ];

      const missingBeforeVerify = requiredDocumentKeys.filter((key) => !uploadedDocumentKeys.includes(key));
      if (missingBeforeVerify.length > 0) {
        setAddressCheckError(`Please upload required documents first: ${missingBeforeVerify.join(", ")}`);
        setJourneyLoading(false);
        setIsUploadingDocs(false);
        return;
      }

      const addressProofImage = await fileToDataUrl(addressFile);

      const verifyRes = await fetch(`${BACKEND}/api/verify-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aadhaar_image: kycAadhaarImageData,
          pan_image: kycPanImageData,
          address_proof_image: addressProofImage,
          selfie_image: capturedSelfie,
          required_documents: requiredDocumentKeys,
          uploaded_documents: uploadedDocumentKeys,
          latitude: locationData?.latitude ?? null,
          longitude: locationData?.longitude ?? null,
        }),
      });

      if (!verifyRes.ok) {
        const errorBody = await verifyRes
          .json()
          .then((x) => String(x?.detail || "Address verification failed"))
          .catch(() => "Address verification failed");
        throw new Error(errorBody);
      }

      const verifyData = (await verifyRes.json()) as {
        aadhaar_address?: string;
        proof_address?: string;
        matches: boolean;
        reason: string;
        name_match?: boolean;
        dob_match?: boolean;
        gender_match?: boolean;
        aadhaar_number_valid?: boolean;
        pan_number_valid?: boolean;
        blood_group?: string | null;
        proof_city?: string | null;
        geo_city?: string | null;
        city_match?: boolean | null;
        aadhaar_photo_base64?: string | null;
        pan_photo_base64?: string | null;
        selfie_match_score?: number | null;
        selfie_match?: boolean | null;
        pan_has_address?: boolean | null;
        required_documents?: string[];
        documents_complete?: boolean;
        missing_required_documents?: string[];
      };
      setAddressCheck(verifyData);
      try {
        sessionStorage.setItem(
          "vantage_last_geo_check",
          JSON.stringify({
            latitude: locationData?.latitude ?? null,
            longitude: locationData?.longitude ?? null,
            geo_city: verifyData.geo_city ?? null,
            proof_city: verifyData.proof_city ?? null,
            city_match: verifyData.city_match ?? null,
            at: new Date().toISOString(),
          }),
        );
      } catch {
        /* ignore */
      }

      if (verifyData.documents_complete !== false) {
        const decisionRes = await fetch(`${BACKEND}/api/decision/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            income: preapproval.monthly_income,
            requested_amount: preapproval.requested_loan_amount,
            eligible_amount: preapproval.eligible_amount,
            kyc_status: verifyData.matches ? "VERIFIED" : "REVIEW",
            document_status: "VERIFIED",
            risk_flag: verifyData.selfie_match === false ? "HIGH_RISK" : "LOW_RISK",
          }),
        });
        if (!decisionRes.ok) throw new Error("Decision engine failed");
        const decision = (await decisionRes.json()) as FinalDecision;
        setFinalDecision(decision);

        const transcriptText = messagesRef.current.map((m) => `[${m.role}] ${m.content}`).join("\n");
        try {
          await fetch(`${BACKEND}/api/log-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              schema_version: "2026-04",
              session_id: sessionIdRef.current,
              campaign_id: campaignId || undefined,
              campaign_link: campaignLink || undefined,
              lead_id: leadId || undefined,
              source_channel: "video_call",
              loan_type: preapproval.loan_type,
              phone: effectivePhone || undefined,
              room_url: roomUrl || undefined,
              transcript_text: transcriptText,
              messages: messagesRef.current,
              extracted: {
                ...preapproval,
                aadhaar_photo_base64: verifyData.aadhaar_photo_base64 || null,
                pan_photo_base64: verifyData.pan_photo_base64 || null,
                selfie_image: capturedSelfie || null,
                blood_group: verifyData.blood_group || null,
                selfie_match_score: verifyData.selfie_match_score || null,
                selfie_match: verifyData.selfie_match || null,
                pan_has_address: verifyData.pan_has_address || null,
                required_documents: verifyData.required_documents || preapproval.document_requirements || [],
                additional_documents: Object.entries(extraDocuments)
                  .filter(([, file]) => Boolean(file))
                  .map(([key, file]) => ({ key, filename: file?.name || "" })),
              },
              risk: {
                kyc_status: verifyData.matches ? "VERIFIED" : "REVIEW",
                risk_flag: verifyData.selfie_match === false ? "HIGH_RISK" : "LOW_RISK",
                document_verification: verifyData,
              },
              offer: {
                status: decision.decision_status,
                loan_amount: decision.final_approved_amount,
                interest_rate: decision.interest_rate,
                tenure_options: decision.tenure_options,
              },
              decision_trace: [decision.reason, verifyData.reason],
              client_started_at: sessionStartedAtRef.current,
            }),
          });
          sessionStorage.setItem(
            "vantage_last_session",
            JSON.stringify({
              session_id: sessionIdRef.current,
              campaign_id: campaignId || undefined,
              campaign_link: campaignLink || undefined,
              loan_type: preapproval.loan_type,
              logged_at: new Date().toISOString(),
              offer: {
                status: decision.decision_status,
                loan_amount: decision.final_approved_amount,
              },
              risk: {
                risk_band: verifyData.selfie_match === false ? "HIGH" : "LOW",
                risk_score: verifyData.selfie_match === false ? 80 : 20,
              },
            }),
          );
        } catch {
          /* best effort */
        }
        setPhase("offer");
      } else {
        setAddressCheckError("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to verify address right now.";
      setAddressCheckError(msg);
      setJourneyError(msg);
    } finally {
      setIsUploadingDocs(false);
      setJourneyLoading(false);
    }
  };

  const isKycUploadStage = isOtpVerified && isLanguageConfirmed && phase === "kyc-upload";
  const isPreapprovalStage = isOtpVerified && isLanguageConfirmed && phase === "preapproval-review";
  const isLoanDocsStage = isOtpVerified && isLanguageConfirmed && phase === "loan-docs";
  const isOfferStage = isOtpVerified && isLanguageConfirmed && phase === "offer";
  const isConversationStage = isOtpVerified && isLanguageConfirmed && (phase === "conversation" || phase === "analyzing");
  const isPreCallStage = !isOtpVerified || !isLanguageConfirmed;

  return (
   <main className={`relative ${isConversationStage ? "h-screen overflow-x-hidden overflow-y-hidden" : "min-h-screen overflow-x-hidden overflow-y-auto"} flex flex-col ${theme === "dark" ? "bg-slate-950" : "bg-white"}`}>
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {isPreCallStage && (
        <div className="pointer-events-none absolute inset-0 z-0 opacity-90">
          <Waves strokeColor="#bfdbfe" backgroundColor="#eff6ff" pointerSize={0.35} />
        </div>
      )}

      {/* Change 4: Session Drop Overlay */}
      {sessionDropped && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="glass-card p-8 max-w-md text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-semibold text-white">Session Interrupted</h2>
            <p className="text-sm text-slate-400">Your video or voice connection was lost for more than 5 seconds. Please restart your KYC session.</p>
            <button
              onClick={() => window.location.href = "/"}
              className="btn-primary w-full"
            >
              Restart Session
            </button>
          </div>
        </div>
      )}

      {showDownloadPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg">
            <AnimatedDownload
              isAnimating={isDownloadAnimating}
              onAnimationComplete={handleDownloadAnimationComplete}
            />
          </div>
        </div>
      )}

      {isOtpVerified && isLanguageConfirmed && !isPreCallConsentAccepted && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.22)] sm:p-6">
            <h3 className="text-sm font-semibold text-slate-900">{t.preCallDisclaimerTitle}</h3>
            <div className="mt-3 space-y-2 text-[10px] leading-relaxed text-slate-600 sm:text-[11px]">
              <p>{t.preCallDisclaimerBody}</p>
              <p>{t.preCallDisclaimerBody2}</p>
            </div>
            <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                type="checkbox"
                checked={isPreCallConsentAccepted}
                onChange={(e) => setIsPreCallConsentAccepted(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-[10px] leading-relaxed text-slate-700 sm:text-[11px]">
                {t.preCallConsentLabel}
              </span>
            </label>
            <button
              type="button"
              disabled={!isPreCallConsentAccepted}
              onClick={() => setIsPreCallConsentAccepted(true)}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] py-2.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {t.startVideoCallBtn}
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="sticky top-0 z-40 transition-all duration-500">
        <div
          className="mx-auto w-full transition-all duration-500 ease-out"
          style={{
            maxWidth: scrolled ? "56rem" : "100%",
            marginTop: scrolled ? "10px" : "0",
            borderRadius: scrolled ? "12px" : "0",
            background: scrolled
              ? (theme === "dark" ? "rgba(5,5,8,0.85)" : "rgba(255,255,255,0.85)")
              : (theme === "dark" ? "rgba(2,6,23,0.9)" : "rgba(255,255,255,0.9)"),
            backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "blur(10px)",
            WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)" : "blur(10px)",
            border: scrolled
              ? (theme === "dark" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)")
              : "1px solid transparent",
            boxShadow: scrolled ? "0 4px 20px rgba(0,0,0,0.08)" : "none",
          }}
        >
        <nav className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <Image src="/pfl-logo.png" alt="Poonawalla Fincorp" width={150} height={44} className="h-7 w-auto object-contain" priority />
            <div className={`h-6 w-px shrink-0 ${theme === "dark" ? "bg-slate-700" : "bg-slate-200"}`} />
            <div className="leading-tight">
              <span className={`block text-[15px] font-bold tracking-wide ${theme === "dark" ? "text-slate-100" : "text-slate-900"}`}>VANTAGE</span>
              <span className={`block text-[8px] font-medium ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>by Poonawalla Fincorp</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1">
            <a href="/#how-it-works" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              {/* How It Works */}
            </a>
            <a href="/#security" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              {/* Security */}
            </a>
          </div>

          <div className="flex items-center gap-2">
          {isOtpVerified && isLanguageConfirmed && (
            <>
              <Link
                href="/"
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${theme === "dark" ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}
              >
                Go Home
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${theme === "dark" ? "border-slate-700 text-slate-100 hover:bg-slate-800" : "border-slate-200 text-slate-800 hover:bg-slate-100"}`}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </>
          )}
          {phase === "conversation" && agentNotice && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200 max-w-[280px]">
              <span className="text-xs text-amber-700 font-medium leading-tight">
                {agentNotice}
              </span>
            </div>
          )}
          {phase === "conversation" && sttStatus === "failed" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200 max-w-[220px]">
              <span className="text-xs text-amber-700 font-medium leading-tight">
                Voice unavailable — use the text box (check mic permission & Deepgram key)
              </span>
            </div>
          )}
          {phase === "conversation" && sttStatus === "live" && isListening && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">{t.listening}</span>
            </div>
          )}
          {phase === "conversation" && sttStatus === "connecting" && (
            <div className="text-[11px] text-slate-500">{t.connectingCall}</div>
          )}
          {phase === "analyzing" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <svg className="animate-spin h-3 w-3 text-amber-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-amber-400 font-medium">{t.analyzingDetails}</span>
            </div>
          )}
        </div>
        </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 mx-auto flex h-[calc(100vh-48px)] w-full max-w-[1600px] flex-col gap-3 px-3 py-3 lg:flex-row lg:px-4">
        {/* Left: Video */}
        <div className={`flex min-h-0 flex-col items-center overflow-y-auto p-3 lg:p-4 ${isConversationStage ? "lg:flex-[0.76]" : "lg:flex-1"} ${(isKycUploadStage || isPreapprovalStage || isLoanDocsStage || isOfferStage) ? "justify-start" : "justify-center"}`}>
          {!isOtpVerified && (
            <div className="fixed inset-0 z-20 flex items-center justify-center bg-white px-4">
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none"
                viewBox="0 0 1440 900"
                fill="none"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true"
              >
                <path d="M-120 95 C 180 170, 360 10, 700 95 S 1240 210, 1580 120" stroke="#1B2B6B" strokeOpacity="0.16" strokeWidth="2.5" />
                <path d="M-180 170 C 140 270, 360 70, 700 160 S 1240 280, 1620 200" stroke="#2563EB" strokeOpacity="0.15" strokeWidth="2.5" />
                <path d="M-100 250 C 190 310, 380 150, 710 235 S 1250 340, 1590 285" stroke="#1B2B6B" strokeOpacity="0.16" strokeWidth="2.5" />
                <path d="M-140 325 C 160 410, 390 220, 730 315 S 1260 430, 1600 360" stroke="#2563EB" strokeOpacity="0.17" strokeWidth="2.5" />
                <path d="M-160 400 C 170 490, 400 300, 740 390 S 1260 510, 1600 445" stroke="#1B2B6B" strokeOpacity="0.17" strokeWidth="2.5" />
                <path d="M-120 475 C 190 560, 430 370, 760 470 S 1280 595, 1620 530" stroke="#2563EB" strokeOpacity="0.15" strokeWidth="2.5" />
                <path d="M-150 550 C 170 640, 420 455, 750 545 S 1270 675, 1610 610" stroke="#1B2B6B" strokeOpacity="0.16" strokeWidth="2.5" />
                <path d="M-180 625 C 140 705, 410 520, 760 615 S 1280 750, 1630 690" stroke="#2563EB" strokeOpacity="0.15" strokeWidth="2.5" />
                <path d="M-120 700 C 200 770, 430 595, 770 685 S 1300 810, 1620 760" stroke="#1B2B6B" strokeOpacity="0.16" strokeWidth="2.5" />
                <path d="M-170 770 C 140 840, 420 665, 780 755 S 1310 870, 1650 825" stroke="#2563EB" strokeOpacity="0.17" strokeWidth="2.5" />
                <path d="M-90 835 C 230 885, 460 740, 790 825 S 1320 920, 1600 880" stroke="#1B2B6B" strokeOpacity="0.14" strokeWidth="2.5" />
                <path d="M-130 885 C 210 935, 450 790, 800 875 S 1330 960, 1640 930" stroke="#2563EB" strokeOpacity="0.14" strokeWidth="2.5" />
              </svg>

              <div className="entry-zoom-card relative z-10 w-full max-w-[400px] rounded-3xl border border-indigo-100 bg-white p-10 shadow-[0_4px_40px_rgba(27,43,107,0.08)]">
                <div className="mx-auto mb-5 flex h-13 w-13 items-center justify-center rounded-2xl border border-blue-200 bg-gradient-to-br from-indigo-50 to-blue-100">
                  <svg className="h-6 w-6 text-[#1B2B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 018 0v4" />
                    <circle cx="12" cy="16" r="1" fill="currentColor" />
                  </svg>
                </div>

                <h2 className="mb-2 text-center text-xl font-bold tracking-tight text-slate-900">Verify Your Identity</h2>
                <p className="mb-7 text-center text-sm leading-relaxed text-slate-500">
                  Enter the 6-digit OTP sent to your email with the Video KYC link.
                </p>

                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-slate-700">One-time passcode</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value.replace(/\D/g, ""));
                    setOtpError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleVerifyLinkOtp();
                  }}
                  placeholder="• • • • • •"
                  className="mb-2 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] text-[#1B2B6B] placeholder-slate-300 transition-all focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] focus:outline-none"
                />
                {otpError && <p className="mb-3 text-center text-xs text-red-500">{otpError}</p>}
                <p className="mb-6 text-center text-[11px] text-slate-400">Check spam if you don&apos;t see it in your inbox</p>

                <button
                  onClick={() => void handleVerifyLinkOtp()}
                  disabled={otpVerifying || otpInput.trim().length !== 6}
                  className="w-full rounded-2xl bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(27,43,107,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(27,43,107,0.3)] disabled:cursor-not-allowed disabled:transform-none disabled:opacity-40"
                >
                  {otpVerifying ? "Verifying…" : "Verify OTP"}
                </button>

                <Link
                  href="/"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Back to Home
                </Link>

                <div className="mt-5 flex items-center justify-center gap-4 border-t border-slate-100 pt-4">
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> RBI V-CIP
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Encrypted
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> DPDPA 2023
                  </span>
                </div>
              </div>
            </div>
          )}

          {isOtpVerified && !isLanguageConfirmed && (
            <div className="w-full max-w-2xl mx-auto py-3 sm:py-4">
              <div className="entry-zoom-card rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_8px_45px_rgba(27,43,107,0.1)] sm:p-6 lg:p-7">
                <div className="mb-6 text-center">
                  <h2 className="text-[30px] font-bold tracking-tight text-slate-900 leading-[1.1]">{t.chooseLanguage}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {t.selectLanguageDesc}
                  </p>
                </div>
                <div className="space-y-2">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.code}
                      onClick={() => setActiveLanguage(option.code)}
                      className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                        activeLanguage === option.code
                          ? "border-indigo-300 bg-indigo-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className="text-xs text-slate-500">{option.native}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleConfirmLanguage}
                  className="mt-6 w-full rounded-2xl bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(27,43,107,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(27,43,107,0.3)]"
                >
                  {t.continueBtn}
                </button>
              </div>
            </div>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "connecting" && (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-indigo-500/10 flex items-center justify-center pulse-ring">
                <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">{t.initializingCall}</h2>
              <p className="text-sm text-slate-400">{t.pleaseWait}</p>
            </div>
          )}

          {isOtpVerified && isLanguageConfirmed && (phase === "conversation" || phase === "analyzing") && (
            <div className="w-full max-w-2xl">
              <div className="rounded-[28px] border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/70 p-2 shadow-[0_20px_70px_rgba(37,99,235,0.16)]">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white glow-primary">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-video bg-black/50 object-cover"
                  />
                  {livenessPhase !== "idle" && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-[1px]">
                      <div className="w-full max-w-md rounded-2xl border border-blue-200 bg-white/95 px-4 py-4 text-center shadow-[0_12px_45px_rgba(37,99,235,0.16)]">
                        <div className="mb-2 flex items-center justify-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${livenessPhase.includes("ack") || livenessPhase === "verified" ? "bg-emerald-500" : "bg-blue-500 animate-pulse"}`} />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
                            {livenessPhase === "verified" ? "Liveness Verified" : "Liveness Check"}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{livenessText}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                    <div className="glass rounded-lg px-3 py-1.5">
                      <span className="text-xs text-slate-200 font-medium">You</span>
                    </div>
                    {phase === "analyzing" && (
                      <div className="glass rounded-lg px-4 py-2 flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-cyan-400" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-xs text-cyan-400">{processingStep}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "kyc-upload" && (
            <>
              {showKycLoadingScreen && (
                <div className="w-full max-w-2xl mx-auto flex items-center justify-center py-8 sm:py-12">
                  <div className="text-center">
                    <div className="flex justify-center mb-6">
                      <LumaSpin />
                    </div>
                    <p className="text-sm text-slate-600">Processing your KYC details...</p>
                  </div>
                </div>
              )}

              {!showKycLoadingScreen && (
            <div className="w-full max-w-2xl mx-auto py-3 sm:py-4">
              <div className="entry-zoom-card rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_8px_45px_rgba(27,43,107,0.1)] sm:p-6 lg:p-7">
                <div className="mb-4">
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-[0.28em] text-[#2563EB] transition-all duration-700 ${
                      kycLoadingComplete
                        ? "translate-y-0 opacity-100"
                        : "translate-y-2 opacity-0"
                    }`}
                    style={{
                      transitionProperty: "transform, opacity",
                    }}
                  >
                    Step 2
                  </p>
                </div>
                <div className="mb-4 text-center md:text-left">
                  <h2 className="text-[30px] font-bold tracking-tight text-slate-900 leading-[1.1]">Complete KYC Document Upload</h2>
                  <p className="mt-1.5 text-sm text-slate-500">Upload Aadhaar and PAN to complete identity verification.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-700">Aadhaar Card</label>
                    <input
                      id="kyc-aadhaar-input"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setKycAadhaarFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="kyc-aadhaar-input" className="flex cursor-pointer items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-[#1B2B6B] transition hover:border-indigo-300 hover:bg-indigo-50">
                      Choose Aadhaar File
                    </label>
                    <p className="mt-2 truncate text-xs text-slate-500">{kycAadhaarFile?.name || "No file selected"}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-700">PAN Card</label>
                    <input
                      id="kyc-pan-input"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setKycPanFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="kyc-pan-input" className="flex cursor-pointer items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-[#1B2B6B] transition hover:border-indigo-300 hover:bg-indigo-50">
                      Choose PAN File
                    </label>
                    <p className="mt-2 truncate text-xs text-slate-500">{kycPanFile?.name || "No file selected"}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Live selfie capture</p>
                      <p className="text-xs text-emerald-700/80">Captured automatically before camera shutdown.</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${capturedSelfie ? "bg-emerald-200 text-emerald-900" : "bg-amber-100 text-amber-800"}`}>
                      {capturedSelfie ? "Captured" : "Missing"}
                    </span>
                  </div>
                  {capturedSelfie ? (
                    <img
                      src={capturedSelfie}
                      alt="Captured selfie"
                      className="mx-auto aspect-square w-full max-w-[420px] rounded-xl border border-emerald-200 object-cover"
                    />
                  ) : (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      We could not capture your selfie in this run. Please restart the session.
                    </p>
                  )}
                </div>

                {journeyError && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {journeyError}
                  </div>
                )}

                <button
                  disabled={isVerifyingKycDocs || !kycAadhaarFile || !kycPanFile || !capturedSelfie}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(27,43,107,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(27,43,107,0.3)] disabled:cursor-not-allowed disabled:transform-none disabled:opacity-40"
                  onClick={() => {
                    void handleVerifyKycDocuments();
                  }}
                >
                  {isVerifyingKycDocs ? "Verifying KYC..." : "Verify KYC"}
                </button>

                {kycVerifyResult && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${kycVerifyResult.kyc_status === "VERIFIED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    <p className="font-semibold">{kycVerifyResult.kyc_status === "VERIFIED" ? "KYC verified" : "KYC verification failed"}</p>
                    <p className="mt-1 text-xs opacity-90">{kycVerifyResult.reason}</p>
                  </div>
                )}
              </div>
            </div>
              )}
            </>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "preapproval-review" && preapproval && (
            <>
              {showPreapprovalLoadingScreen && (
                <div className="w-full flex items-center justify-center py-12 sm:py-16">
                  <div className="text-center">
                    <div className="flex justify-center mb-6">
                      <LumaSpin />
                    </div>
                    <p className="text-sm text-slate-600">Processing your pre-approval details...</p>
                  </div>
                </div>
              )}

              {!showPreapprovalLoadingScreen && (
                <div className="w-full max-w-2xl mx-auto py-6 sm:py-8 flex flex-col gap-6">
                  <div className="text-center">
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-[0.28em] text-[#2563EB] transition-all duration-700 ${
                        preapprovalLoadingComplete
                          ? "translate-y-0 opacity-100"
                          : "translate-y-2 opacity-0"
                      }`}
                      style={{
                        transitionProperty: "transform, opacity",
                      }}
                    >
                      Step 3
                    </p>
                    <h2 className="text-[32px] font-bold tracking-tight text-slate-900 leading-[1.1] mt-2">Pre-Approved Offer</h2>
                    <p className="mt-2 text-sm text-slate-500">Review and edit your KYC details, then download the KYC review PDF.</p>
                  </div>

                  <div className="entry-zoom-card rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_8px_45px_rgba(27,43,107,0.1)] sm:p-6 lg:p-7">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Applicant Name</label>
                        <input value={editableKycData.applicant_name} onChange={(e) => setEditableKycData((p) => ({ ...p, applicant_name: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Aadhaar Number</label>
                        <input value={editableKycData.aadhaar_number} onChange={(e) => setEditableKycData((p) => ({ ...p, aadhaar_number: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">PAN Number</label>
                        <input value={editableKycData.pan_number} onChange={(e) => setEditableKycData((p) => ({ ...p, pan_number: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">DOB</label>
                          <input value={editableKycData.dob} onChange={(e) => setEditableKycData((p) => ({ ...p, dob: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Gender</label>
                          <input value={editableKycData.gender} onChange={(e) => setEditableKycData((p) => ({ ...p, gender: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">Pre-Approved Amount</p>
                      <p className="text-3xl font-bold text-emerald-900">INR {Number(preapproval.eligible_amount || 0).toLocaleString("en-IN")}</p>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-3">
                      <button
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        onClick={handleGoToPreviousStep}
                      >
                        Previous
                      </button>
                      <button
                        disabled={isGeneratingKycPdf || isDownloadAnimating}
                        className="rounded-2xl border border-indigo-200 bg-white px-4 py-3.5 text-sm font-semibold text-[#1B2B6B] transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          handleDownloadKycPdf();
                        }}
                      >
                        {isGeneratingKycPdf || isDownloadAnimating ? "Preparing PDF..." : "Download PDF"}
                      </button>
                      <button 
                        className="rounded-2xl bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(27,43,107,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(27,43,107,0.3)]"
                        onClick={handleProceedAfterKycReview}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "loan-docs" && (
            <div className="w-full max-w-2xl mx-auto py-6 sm:py-8 flex flex-col gap-6">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#2563EB]">Step 4</p>
                <h2 className="text-[32px] font-bold tracking-tight text-slate-900 leading-[1.1] mt-2">Loan Documents</h2>
                <p className="mt-2 text-sm text-slate-500">Upload loan-type specific documents for {currentLoanLabel}.</p>
              </div>

              <div className="entry-zoom-card rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_8px_45px_rgba(27,43,107,0.1)] sm:p-6 lg:p-7">
                <div className="space-y-4">
                  {loanDocumentRequirements.map((requirement) => {
                    if (requirement.key === "address_proof") {
                      return (
                        <div key={requirement.key}>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">{requirement.label}</label>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => setAddressFile(e.target.files?.[0] || null)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-200 file:text-[#1B2B6B] hover:file:bg-indigo-100"
                          />
                          <p className="mt-1 text-xs text-slate-500">{addressFile?.name || "No file selected"}</p>
                        </div>
                      );
                    }
                    return (
                      <div key={requirement.key}>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">{requirement.label}</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) =>
                            setExtraDocuments((prev) => ({
                              ...prev,
                              [requirement.key]: e.target.files?.[0] || null,
                            }))
                          }
                          className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-indigo-300 focus:bg-white transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-200 file:text-[#1B2B6B] hover:file:bg-indigo-100"
                        />
                        <p className="mt-1 text-xs text-slate-500">{extraDocuments[requirement.key]?.name || "No file selected"}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    disabled={isUploadingDocs}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleGoToPreviousStep}
                  >
                    Previous
                  </button>
                  <button
                    disabled={isUploadingDocs || !capturedSelfie || !addressFile}
                    className={`rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(27,43,107,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      isUploadingDocs
                        ? "bg-gradient-to-r from-[#1B2B6B] via-[#2563EB] to-[#1D4ED8] animate-gradient bg-[length:220%_220%]"
                        : "bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(27,43,107,0.3)]"
                    }`}
                    onClick={() => {
                      void handleDocumentSubmit();
                    }}
                  >
                    {isUploadingDocs ? "Verifying Documents..." : "Submit Loan Documents"}
                  </button>
                </div>

                {addressCheck && (
                  <div
                    className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                      addressCheck.matches
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}
                  >
                    <p className="font-semibold">
                      {addressCheck.matches ? "✓ Address verification passed" : "Address verification needs review"}
                    </p>
                    <p className="mt-1 text-xs opacity-90">{addressCheck.reason}</p>
                    {!addressCheck.matches && (
                      <p className="mt-1 text-xs opacity-90">
                        We will continue this application and route it for additional review if needed.
                      </p>
                    )}
                    <p className="mt-1 text-xs opacity-90">
                      Name: {addressCheck.name_match ? "✓ match" : "✗ mismatch"} · DOB: {addressCheck.dob_match ? "✓ match" : "✗ mismatch"} · Gender: {addressCheck.gender_match ? "✓ match" : "✗ mismatch"}
                    </p>
                    <p className="mt-1 text-xs opacity-90">
                      Aadhaar: {addressCheck.aadhaar_number_valid ? "✓ valid" : "✗ invalid"} · PAN: {addressCheck.pan_number_valid ? "✓ valid" : "✗ invalid"}
                    </p>
                    {addressCheck.pan_has_address != null && (
                      <p className="mt-1 text-xs opacity-90">
                        PAN address: {addressCheck.pan_has_address ? "present" : "not present"}
                      </p>
                    )}
                    {addressCheck.selfie_match_score != null && (
                      <p className="mt-1 text-xs opacity-90">
                        Selfie match: {Math.round((addressCheck.selfie_match_score || 0) * 100)}%
                      </p>
                    )}
                    {addressCheck.missing_required_documents?.length ? (
                      <div className="mt-2">
                        <p className="text-xs font-medium mb-1">Missing required documents</p>
                        <ul className="space-y-1 text-xs opacity-90">
                          {addressCheck.missing_required_documents.map((doc) => (
                            <li key={doc}>• {doc}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
                {addressCheckError && !addressCheck && (
                  <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {addressCheckError}
                  </div>
                )}
              </div>
            </div>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "offer" && finalDecision && preapproval && (
            <>
              {showOfferLoadingScreen && (
                <div className="w-full min-h-[calc(100vh-170px)] flex items-center justify-center px-3 py-4">
                  <div className="entry-zoom-card w-full max-w-4xl rounded-[28px] border border-blue-100 bg-gradient-to-b from-white to-blue-50/70 p-4 shadow-[0_10px_45px_rgba(37,99,235,0.12)] sm:p-6">
                    <div className="relative mx-auto flex h-[300px] w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-white/80">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.10),transparent_70%)]" />

                      <div className="absolute left-6 top-8 hidden md:block">
                        <IconContainer
                          delay={0.1}
                          text="OCR Extraction"
                          icon={<FileSearch className="h-6 w-6 text-blue-600" />}
                        />
                      </div>

                      <div className="absolute right-6 top-10 hidden md:block">
                        <IconContainer
                          delay={0.2}
                          text="Field Matching"
                          icon={<FolderSearch className="h-6 w-6 text-blue-600" />}
                        />
                      </div>

                      <div className="absolute left-12 bottom-10 hidden md:block">
                        <IconContainer
                          delay={0.3}
                          text="Compliance"
                          icon={<ShieldCheck className="h-6 w-6 text-blue-600" />}
                        />
                      </div>

                      <div className="absolute right-10 bottom-12 hidden md:block">
                        <IconContainer
                          delay={0.4}
                          text="Decision Ready"
                          icon={<FileCheck2 className="h-6 w-6 text-blue-600" />}
                        />
                      </div>

                      <Radar className="absolute -bottom-4" />
                      <div className="absolute bottom-0 z-[41] h-px w-full bg-gradient-to-r from-transparent via-blue-300 to-transparent" />
                    </div>
                  </div>
                </div>
              )}

              {!showOfferLoadingScreen && (
                <div className="w-full mx-auto py-6 sm:py-8 flex flex-col gap-6 px-1 sm:px-3 lg:px-4">
                  <div className="text-center">
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-[0.28em] text-[#2563EB] transition-all duration-700 ${
                        offerLoadingComplete
                          ? "translate-y-0 opacity-100"
                          : "translate-y-2 opacity-0"
                      }`}
                      style={{ transitionProperty: "transform, opacity" }}
                    >
                      Step 5
                    </p>
                    <h2 className="text-[32px] font-bold tracking-tight text-slate-900 leading-[1.1] mt-2">Final Loan Decision</h2>
                    <p className="mt-2 text-sm text-slate-500">Final outcome with key reasoning signals from your verification journey.</p>
                  </div>

                  <div className="entry-zoom-card rounded-[28px] border border-indigo-100 bg-white p-5 shadow-[0_8px_45px_rgba(27,43,107,0.1)] sm:p-6 lg:p-7">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Decision Status</p>
                      <p className={`text-3xl font-bold ${finalDecision.decision_status === "APPROVED" ? "text-emerald-700" : finalDecision.decision_status === "HOLD" ? "text-amber-700" : "text-rose-700"}`}>
                        {finalDecision.decision_status}
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-sm">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Final Approved Amount</p>
                        <p className="text-xl font-bold text-slate-900">INR {Number(finalDecision.final_approved_amount || 0).toLocaleString("en-IN")}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Interest Rate</p>
                        <p className="text-xl font-bold text-slate-900">{finalDecision.interest_rate}%</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Tenure Options</p>
                        <p className="text-lg font-semibold text-slate-900">{(finalDecision.tenure_options || []).join(", ") || "N/A"} months</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-1">Decision Reasoning</p>
                      <p className="text-lg font-bold text-indigo-950">{explainDecisionReason(finalDecision.reason)}</p>
                      <div className="mt-3 space-y-1.5 text-sm text-indigo-900/90">
                        <p>Raw engine reason: {finalDecision.reason || "Not provided"}</p>
                        <p>Risk flag: {finalDecision.risk_flag || "Not provided"}</p>
                        <p>KYC verification: {kycVerifyResult?.kyc_status || "Not available"}</p>
                        <p>Document completeness: {addressCheck?.documents_complete === false ? "Incomplete" : "Complete"}</p>
                        {addressCheck?.selfie_match_score != null && (
                          <p>Selfie match confidence: {Math.round((addressCheck.selfie_match_score || 0) * 100)}%</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                      <button
                        type="button"
                        onClick={handleGoToPreviousStep}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Previous Step
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadApplicationPdf}
                        disabled={isDownloadAnimating}
                        className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#1B2B6B] transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Download application PDF
                      </button>
                      <Link
                        href="/dashboard"
                        className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#1B2B6B] transition hover:bg-indigo-50"
                      >
                        Open applications dashboard
                      </Link>
                      <Link
                        href="/"
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Start new session
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "offer" && offerData && !finalDecision && !showOfferLoadingScreen && (
            <div className="w-full max-w-md mx-auto space-y-4">
              <OfferCard
                status={offerData.status as string}
                loanAmount={offerData.loan_amount as number}
                tenureMonths={offerData.tenure_months as number}
                interestRate={offerData.interest_rate as number}
                monthlyEmi={offerData.monthly_emi as number}
                processingFee={offerData.processing_fee as number}
                confidenceScore={offerData.confidence_score as number}
                riskBand={riskSnapshot?.risk_band as string | undefined}
                riskScore={riskSnapshot?.risk_score as number | undefined}
                fraudFlags={
                  (riskSnapshot?.fraud_flags as
                    | { flag?: string; severity?: string; details?: string }[]
                    | undefined) ?? undefined
                }
                customerSummary={
                  customerSnapshot
                    ? {
                        name: String(customerSnapshot.name || ""),
                        declared_age: Number(customerSnapshot.declared_age || 0),
                        income: Number(customerSnapshot.income || 0),
                        employment: String(customerSnapshot.employment || ""),
                        purpose: String(customerSnapshot.purpose || ""),
                      }
                    : undefined
                }
                verificationSummary={
                  offerData.verification_summary as {
                    age_verified?: boolean;
                    age_estimate?: number | null;
                    age_confidence?: number | null;
                    age_match_score?: number | null;
                    location_verified?: boolean;
                    income_declared?: number;
                    income_verified?: boolean;
                    employment?: string;
                    consent_captured?: boolean;
                    no_fraud_flags?: boolean;
                  }
                }
              />
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleDownloadApplicationPdf}
                  disabled={isDownloadAnimating}
                  className="text-center text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download application PDF
                </button>
                <Link
                  href="/dashboard"
                  className="text-center text-sm text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                >
                  Open applications dashboard
                </Link>
                <Link
                  href="/"
                  className="text-center text-sm text-slate-400 hover:text-slate-300 underline underline-offset-2"
                >
                  Start new session
                </Link>
              </div>
            </div>
          )}

          {isOtpVerified && isLanguageConfirmed && phase === "error" && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Connection Error</h2>
              <p className="text-sm text-slate-600 mb-4">{cameraError || journeyError || "Unable to access camera or connect to the server"}</p>
              <button onClick={() => window.location.reload()} className="btn-primary">
                Try Again
              </button>
            </div>
          )}
        </div>

        {isConversationStage && (
        <div className="w-full h-[360px] lg:h-full min-h-0 overflow-hidden border-t border-slate-200/70 bg-white/75 backdrop-blur-xl lg:border-t-0 lg:flex-[0.24] lg:w-auto">
            <TranscriptPanel
              messages={messages}
              isListening={isListening}
              interimText={interimText}
              isWaitingForAI={isWaitingForAI}
              customerName={verifiedSession?.full_name || "Nausheen"}
              manualInput={manualInput}
              onManualInputChange={(value: string) => setManualInput(value)}
              onManualSend={handleManualSend}
              onQuickReply={handleQuickReply}
              isMicMuted={isMicMuted}
            />
        </div>
        )}
      </div>

      {/* Change 2: RBI Compliance Disclaimer Footer */}
      {!isKycUploadStage && !isOfferStage && (
      // <footer className="relative z-10 py-2 px-4 text-center bg-black/40 border-t border-white/[0.06]">
        <footer className="relative z-10 py-2 px-4 text-center">
        <p className="text-[10px] text-slate-500 leading-tight">
          This V-CIP session is recorded in compliance with RBI Master KYC Direction 2016. Data encrypted and stored securely per RBI guidelines.
        </p>
      </footer>
      )}
    </main>
  );
}



export default function CallPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen animated-gradient-bg flex items-center justify-center">
          <div className="text-center">
            <VantageLoader text="Loading session..." size="lg" />
          </div>
        </main>
      }
    >
      <CallPageInner />
    </Suspense>
  );
}
