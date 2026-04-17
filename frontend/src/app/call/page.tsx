"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import TranscriptPanel from "@/components/TranscriptPanel";
import OfferCard from "@/components/OfferCard";
import { connectDeepgramStt } from "@/lib/sttService";
import { translations, Language } from "@/lib/translations";

const TTS_LANG_MAP: Record<string, string> = { en: "en-US", hi: "hi-IN", mr: "mr-IN" };

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
  const lang = searchParams.get("lang") || "en";

  const t = translations[lang as Language] || translations.en;

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTranscriptRef = useRef<string>("");

  const [phase, setPhase] = useState<CallPhase>("connecting");
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

  const configuredBackend = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const backendCandidates = uniqueUrls([
    configuredBackend,
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8000",
  ]);
  const BACKEND = backendCandidates[0] || "http://127.0.0.1:8001";

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
    for (const baseUrl of backendCandidates) {
      try {
        const res = await fetchWithTimeout(`${baseUrl}${path}`, options, timeoutMs);
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

  const stopMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // ── 1. Initialize camera + mic ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        setMediaStream(stream);
        setPhase("conversation");
      } catch {
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      stopMediaStream();
    };
  }, [stopMediaStream]);

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
        setSessionDropped(true);
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
        setPreapproval(pre);
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
        body: JSON.stringify({ transcript: text, conversation_history: history, language: lang }),
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
        utterance.lang = TTS_LANG_MAP[lang] || "en-IN";

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
  }, [handleConversationComplete, lang]);

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
            if (!initialGreetingRequestedRef.current) {
              initialGreetingRequestedRef.current = true;
              setTimeout(() => void sendToAgent(""), 1000);
            }
          },
          onError: () => setSttStatus("failed"),
          onClose: () => {
            // Only count as drop while still in active conversation.
            if (phaseRef.current !== "conversation") return;
            if (sessionDropTimerRef.current) clearTimeout(sessionDropTimerRef.current);
            sessionDropTimerRef.current = setTimeout(() => {
              setSessionDropped(true);
            }, 5000);
          },
          onListeningChange: (v) => setIsListening(v),
          onFinalTranscript: (transcript) => {
            if (!transcript.trim()) return;
            setMessages((prev) => [
              ...prev,
              { role: "user", content: transcript, timestamp: getTimestamp() },
            ]);
            pendingTranscriptRef.current += ` ${transcript}`;
          },
          onInterim: (t) => setInterimText(t),
          onUtteranceEnd: () => {
            const accumulated = pendingTranscriptRef.current.trim();
            if (accumulated) {
              pendingTranscriptRef.current = "";
              void sendToAgent(accumulated);
            }
          },
        }, lang);

        sttCloseRef.current = conn.close;
        sttConnRef.current = conn;

        agentTimerRef.current = setInterval(() => {
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
  }, [phase, mediaStream, sendToAgent, lang]);

  // ── Manual text input fallback ────────────────────────────
  const handleManualSend = () => {
    if (!manualInput.trim()) return;
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

  const handleDownloadKycPdf = async () => {
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

  const handleProceedAfterKycReview = () => {
    if (!kycVerifyResult || kycVerifyResult.kyc_status !== "VERIFIED") {
      setJourneyError("Complete KYC verification before continuing.");
      return;
    }
    setPhase("loan-docs");
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
          "vericall_last_geo_check",
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

      if (verifyData.matches && verifyData.documents_complete !== false) {
        const decisionRes = await fetch(`${BACKEND}/api/decision/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            income: preapproval.monthly_income,
            requested_amount: preapproval.requested_loan_amount,
            eligible_amount: preapproval.eligible_amount,
            kyc_status: verifyData.matches ? "VERIFIED" : "FAILED",
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
              phone: phone || undefined,
              room_url: roomUrl || undefined,
              transcript_text: transcriptText,
              messages: messagesRef.current,
              extracted: {
                ...preapproval,
                aadhaar_photo_base64: verifyData.aadhaar_photo_base64 || null,
                pan_photo_base64: verifyData.pan_photo_base64 || null,
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
                kyc_status: verifyData.matches ? "VERIFIED" : "FAILED",
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
            "vericall_last_session",
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
        const missingMsg = (verifyData.missing_required_documents || []).length
          ? ` Missing required documents: ${(verifyData.missing_required_documents || []).join(", ")}.`
          : "";
        setAddressCheckError(`Verification is incomplete.${missingMsg}`);
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

  return (
    <main className="relative min-h-screen animated-gradient-bg overflow-hidden flex flex-col">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

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

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 glass border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">VeriCall Session</h1>
            <p className="text-xs text-slate-400">Poonawalla Fincorp</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {phase === "conversation" && agentNotice && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 max-w-[280px]">
              <span className="text-xs text-amber-300 font-medium leading-tight">
                {agentNotice}
              </span>
            </div>
          )}
          {phase === "conversation" && sttStatus === "failed" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 max-w-[220px]">
              <span className="text-xs text-amber-300 font-medium leading-tight">
                Voice unavailable — use the text box (check mic permission & Deepgram key)
              </span>
            </div>
          )}
          {phase === "conversation" && sttStatus === "live" && isListening && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-emerald-400 font-medium">{t.listening}</span>
            </div>
          )}
          {phase === "conversation" && sttStatus === "connecting" && (
            <div className="text-xs text-slate-400">Starting voice…</div>
          )}
          {phase === "analyzing" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <svg className="animate-spin h-3 w-3 text-amber-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-amber-400 font-medium">Processing</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col lg:flex-row h-[calc(100vh-65px)]">
        {/* Left: Video */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8">
          {phase === "connecting" && (
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

          {(phase === "conversation" || phase === "analyzing") && (
            <div className="w-full max-w-2xl">
              <div className="relative rounded-2xl overflow-hidden glow-primary">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-video bg-black/50 object-cover"
                />
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

              {/* Manual input fallback */}
              {phase === "conversation" && (
                <div className="mt-4 space-y-2">
                  
                  {/* 👇 ADD THIS MESSAGE */}
                  <p className="text-xs text-slate-400 text-center">
                    VeriCall is AI and may make mistakes — if something looks incorrect, feel free to type it out.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualSend()}
                      placeholder="Type a message (or speak)..."
                      className="flex-1 px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition text-sm"
                    />
                    <button onClick={handleManualSend} className="btn-primary px-4 py-3 !rounded-xl">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === "kyc-upload" && (
            <div className="w-full max-w-md mx-auto space-y-4">
              <div className="glass-card p-8">
                <h2 className="text-xl font-semibold text-white mb-2 text-center">Step 2: Complete KYC</h2>
                <p className="text-sm text-slate-400 mb-6 text-center">Upload Aadhaar and PAN to complete identity verification.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Aadhaar Card</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setKycAadhaarFile(e.target.files?.[0] || null)}
                      className="w-full px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-indigo-500 transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">PAN Card</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setKycPanFile(e.target.files?.[0] || null)}
                      className="w-full px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-indigo-500 transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30"
                    />
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div>
                        <p className="text-sm font-medium text-emerald-200">Live selfie capture</p>
                        <p className="text-xs text-emerald-300/70">Captured automatically before camera shutdown.</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-200">
                        {capturedSelfie ? "Captured" : "Missing"}
                      </span>
                    </div>
                    {capturedSelfie ? (
                      <img
                        src={capturedSelfie}
                        alt="Captured selfie"
                        className="h-40 w-full rounded-xl object-cover border border-emerald-500/20"
                      />
                    ) : (
                      <p className="text-xs text-amber-300">
                        We could not capture your selfie in this run. Please restart the session.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  disabled={isVerifyingKycDocs || !kycAadhaarFile || !kycPanFile || !capturedSelfie}
                  className="w-full btn-primary flex items-center justify-center gap-3 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    void handleVerifyKycDocuments();
                  }}
                >
                  {isVerifyingKycDocs ? "Verifying KYC..." : "Verify KYC"}
                </button>
                {kycVerifyResult && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${kycVerifyResult.kyc_status === "VERIFIED" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200"}`}>
                    <p className="font-medium">{kycVerifyResult.kyc_status === "VERIFIED" ? "KYC verified" : "KYC verification failed"}</p>
                    <p className="mt-1 text-xs opacity-90">{kycVerifyResult.reason}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === "preapproval-review" && preapproval && (
            <div className="w-full max-w-md mx-auto space-y-4">
              <div className="glass-card p-8">
                <h2 className="text-xl font-semibold text-white mb-2 text-center">Step 3: Pre-Approved Offer</h2>
                <p className="text-sm text-slate-400 mb-6 text-center">Review and edit KYC details, then download the KYC review PDF.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Applicant Name</label>
                    <input value={editableKycData.applicant_name} onChange={(e) => setEditableKycData((p) => ({ ...p, applicant_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Aadhaar Number</label>
                    <input value={editableKycData.aadhaar_number} onChange={(e) => setEditableKycData((p) => ({ ...p, aadhaar_number: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">PAN Number</label>
                    <input value={editableKycData.pan_number} onChange={(e) => setEditableKycData((p) => ({ ...p, pan_number: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">DOB</label>
                      <input value={editableKycData.dob} onChange={(e) => setEditableKycData((p) => ({ ...p, dob: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm text-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Gender</label>
                      <input value={editableKycData.gender} onChange={(e) => setEditableKycData((p) => ({ ...p, gender: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-sm text-white" />
                    </div>
                  </div>
                </div>
                <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
                  Pre-approved amount: INR {Number(preapproval.eligible_amount || 0).toLocaleString("en-IN")}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    disabled={isGeneratingKycPdf}
                    className="btn-secondary"
                    onClick={() => {
                      void handleDownloadKycPdf();
                    }}
                  >
                    {isGeneratingKycPdf ? "Generating..." : "Download KYC PDF"}
                  </button>
                  <button className="btn-primary" onClick={handleProceedAfterKycReview}>Next</button>
                </div>
              </div>
            </div>
          )}

          {phase === "loan-docs" && (
            <div className="w-full max-w-md mx-auto space-y-4">
              <div className="glass-card p-8">
                <h2 className="text-xl font-semibold text-white mb-2 text-center">Step 4: Loan Documents</h2>
                <p className="text-sm text-slate-400 mb-6 text-center">Upload loan-type specific documents for {currentLoanLabel}.</p>
                <div className="space-y-4">
                  {loanDocumentRequirements.map((requirement) => {
                    if (requirement.key === "address_proof") {
                      return (
                        <div key={requirement.key}>
                          <label className="block text-sm font-medium text-slate-300 mb-2">{requirement.label}</label>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => setAddressFile(e.target.files?.[0] || null)}
                            className="w-full px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-indigo-500 transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30"
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={requirement.key} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <p className="text-sm font-medium text-slate-100 mb-2">{requirement.label}</p>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) =>
                            setExtraDocuments((prev) => ({
                              ...prev,
                              [requirement.key]: e.target.files?.[0] || null,
                            }))
                          }
                          className="w-full px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-indigo-500 transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30"
                        />
                      </div>
                    );
                  })}
                </div>
                <button
                  disabled={isUploadingDocs || !capturedSelfie || !addressFile}
                  className="w-full btn-primary flex items-center justify-center gap-3 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    void handleDocumentSubmit();
                  }}
                >
                  {isUploadingDocs ? "Verifying Documents..." : "Submit Loan Documents"}
                </button>
                {addressCheck && (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                      addressCheck.matches
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-200"
                    }`}
                  >
                    <p className="font-medium">
                      {addressCheck.matches ? "Address verification passed" : "Address verification failed"}
                    </p>
                    <p className="mt-1 text-xs opacity-90">{addressCheck.reason}</p>
                    <p className="mt-1 text-xs opacity-90">
                      Name: {addressCheck.name_match ? "match" : "mismatch"} · DOB: {addressCheck.dob_match ? "match" : "mismatch"} · Gender: {addressCheck.gender_match ? "match" : "mismatch"}
                    </p>
                    <p className="mt-1 text-xs opacity-90">
                      Aadhaar: {addressCheck.aadhaar_number_valid ? "valid" : "invalid"} · PAN: {addressCheck.pan_number_valid ? "valid" : "invalid"}
                    </p>
                    {addressCheck.pan_has_address != null && (
                      <p className="mt-1 text-xs opacity-90">
                        PAN address present: {addressCheck.pan_has_address ? "yes" : "no"}
                      </p>
                    )}
                    {addressCheck.selfie_match_score != null && (
                      <p className="mt-1 text-xs opacity-90">
                        Selfie match score: {Math.round((addressCheck.selfie_match_score || 0) * 100)}%
                        {addressCheck.selfie_match === false ? " · mismatch flagged" : ""}
                      </p>
                    )}
                    {addressCheck.blood_group && (
                      <p className="mt-1 text-xs opacity-90">Blood Group: {addressCheck.blood_group}</p>
                    )}
                    {addressCheck.required_documents?.length ? (
                      <div className="mt-2">
                        <p className="text-xs opacity-90 mb-1">Required documents</p>
                        <ul className="space-y-1 text-xs opacity-90">
                          {addressCheck.required_documents.map((doc) => (
                            <li key={doc}>• {doc}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {addressCheck.documents_complete === false && (
                      <div className="mt-2">
                        <p className="text-xs opacity-90 mb-1">Missing required documents</p>
                        <ul className="space-y-1 text-xs opacity-90">
                          {(addressCheck.missing_required_documents || []).map((doc) => (
                            <li key={doc}>• {doc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(addressCheck.proof_city || addressCheck.geo_city) && (
                      <p className="mt-1 text-xs opacity-90">
                        Proof city: {addressCheck.proof_city || "N/A"} · Current city: {addressCheck.geo_city || "N/A"} ·
                        {" "}
                        City check:{" "}
                        {addressCheck.city_match == null ? "not available" : addressCheck.city_match ? "match" : "mismatch"}
                      </p>
                    )}
                    {addressCheck.aadhaar_photo_base64 && (
                      <div className="mt-3">
                        <p className="text-xs opacity-90 mb-2">Extracted Aadhaar photo</p>
                        <img
                          src={addressCheck.aadhaar_photo_base64}
                          alt="Extracted Aadhaar profile"
                          className="h-20 w-20 rounded-lg object-cover border border-white/20"
                        />
                      </div>
                    )}
                  </div>
                )}
                {addressCheckError && (
                  <p className="mt-3 text-xs text-red-300">
                    {addressCheckError}
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === "offer" && finalDecision && preapproval && (
            <div className="w-full max-w-xl mx-auto glass-card p-6 space-y-4">
              <h2 className="text-2xl font-bold text-white">Final Loan Decision</h2>
              <p className="text-lg text-slate-200">Your loan has been <span className="font-semibold">{finalDecision.decision_status}</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <p className="text-slate-400 text-xs">Final approved amount</p>
                  <p className="text-white font-semibold">INR {Number(finalDecision.final_approved_amount || 0).toLocaleString("en-IN")}</p>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <p className="text-slate-400 text-xs">Interest rate</p>
                  <p className="text-white font-semibold">{finalDecision.interest_rate}%</p>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] sm:col-span-2">
                  <p className="text-slate-400 text-xs">Tenure options</p>
                  <p className="text-white font-semibold">{(finalDecision.tenure_options || []).join(", ")} months</p>
                </div>
              </div>

              <p className="text-xs text-slate-400">Reason: {finalDecision.reason}</p>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <a
                  href={`${BACKEND}/api/documents/${sessionIdRef.current}/application/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                >
                  Download application PDF
                </a>
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

          {phase === "offer" && offerData && !finalDecision && (
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
                <a
                  href={`${BACKEND}/api/documents/${sessionIdRef.current}/application/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                >
                  Download application PDF
                </a>
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

          {phase === "error" && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Connection Error</h2>
              <p className="text-sm text-slate-400 mb-4">Unable to access camera or connect to the server</p>
              <button onClick={() => window.location.reload()} className="btn-primary">
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Right: Dynamic Stage Panel */}
        <div className="lg:w-[380px] w-full h-[300px] lg:h-auto glass border-t lg:border-t-0 lg:border-l border-white/[0.06]">
          {(phase === "conversation" || phase === "analyzing") && (
            <TranscriptPanel
              messages={messages}
              isListening={isListening}
              interimText={interimText}
              isWaitingForAI={isWaitingForAI}
            />
          )}

          {phase === "kyc-upload" && (
            <div className="flex h-full flex-col px-4 py-4 gap-4 overflow-y-auto">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Step 2</p>
                <h3 className="text-lg font-semibold text-white">KYC Verification</h3>
                <p className="text-sm text-slate-400 mt-1">Upload Aadhaar + PAN and validate against live selfie.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <p className="text-xs text-slate-400">Required KYC documents</p>
                <div className="space-y-2 pt-1">
                  {["Aadhaar Card", "PAN Card", "Selfie from call"].map((doc) => (
                    <div key={doc} className="flex items-start gap-2 text-sm text-slate-200">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                      <span>{doc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {phase === "preapproval-review" && preapproval && (
            <div className="flex h-full flex-col px-4 py-4 gap-4 overflow-y-auto">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Step 3</p>
                <h3 className="text-lg font-semibold text-white">Pre-Approved Offer</h3>
                <p className="text-sm text-slate-400 mt-1">Review editable KYC data and download review PDF.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <p className="text-xs text-slate-400">Loan type</p>
                <p className="text-sm text-white font-medium">{currentLoanLabel}</p>
                <p className="text-xs text-slate-400">Pre-approved amount</p>
                <p className="text-sm text-white font-medium">INR {Number(preapproval.eligible_amount || 0).toLocaleString("en-IN")}</p>
              </div>
            </div>
          )}

          {phase === "loan-docs" && preapproval && (
            <div className="flex h-full flex-col px-4 py-4 gap-4 overflow-y-auto">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Step 4</p>
                <h3 className="text-lg font-semibold text-white">Loan Document Check</h3>
                <p className="text-sm text-slate-400 mt-1">Submit post-KYC documents for final approval.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <p className="text-xs text-slate-400">Required documents for {currentLoanLabel}</p>
                <div className="space-y-2 pt-1">
                  {loanDocumentRequirements.map((doc) => (
                    <div key={doc.key} className="flex items-start gap-2 text-sm text-slate-200">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                      <span>{doc.label}{doc.required === false ? " (optional)" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {phase === "offer" && finalDecision && preapproval && (
            <div className="flex h-full flex-col px-4 py-4 gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Step 5</p>
                <h3 className="text-lg font-semibold text-white">Final Decision</h3>
                <p className="text-sm text-slate-400 mt-1">Decision summary for {currentLoanLabel}.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <p className="text-xs text-slate-400">Status</p>
                <p className="text-sm text-white font-medium">{finalDecision.decision_status}</p>
                <p className="text-xs text-slate-400">Approved amount</p>
                <p className="text-sm text-white font-medium">INR {Number(finalDecision.final_approved_amount || 0).toLocaleString("en-IN")}</p>
                <p className="text-xs text-slate-400">Rate / tenure</p>
                <p className="text-sm text-white font-medium">{finalDecision.interest_rate}% for {(finalDecision.tenure_options || []).join(", ")} months</p>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <p className="text-lg font-semibold text-white">Flow interrupted</p>
                <p className="text-sm text-slate-400 mt-2">Please retry from the call start.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Change 2: RBI Compliance Disclaimer Footer */}
      <footer className="relative z-10 py-2 px-4 text-center bg-black/40 border-t border-white/[0.06]">
        <p className="text-[10px] text-slate-500 leading-tight">
          This V-CIP session is recorded in compliance with RBI Master KYC Direction 2016. Data encrypted and stored securely per RBI guidelines.
        </p>
      </footer>
    </main>
  );
}



export default function CallPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen animated-gradient-bg flex items-center justify-center">
          <div className="text-center">
            <svg className="animate-spin h-10 w-10 text-indigo-400 mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-slate-400">Loading session...</p>
          </div>
        </main>
      }
    >
      <CallPageInner />
    </Suspense>
  );
}
