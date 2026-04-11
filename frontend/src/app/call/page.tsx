"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import TranscriptPanel from "@/components/TranscriptPanel";
import OfferCard from "@/components/OfferCard";
import { connectDeepgramStt } from "@/lib/sttService";

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp?: string;
}

type CallPhase = "connecting" | "conversation" | "analyzing" | "offer" | "error";

function CallPageInner() {
  const searchParams = useSearchParams();
  const roomUrl = searchParams.get("room") || "";
  const phone = searchParams.get("phone") || "";

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTranscriptRef = useRef<string>("");

  const [phase, setPhase] = useState<CallPhase>("connecting");
  /** Set when getUserMedia succeeds — drives video element + STT (refs miss first paint while still on "connecting"). */
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [sttStatus, setSttStatus] = useState<"idle" | "connecting" | "live" | "failed">("idle");
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([]);
  const [offerData, setOfferData] = useState<Record<string, unknown> | null>(null);
  const [agentData, setAgentData] = useState<Record<string, unknown> | null>(null);
  const [riskSnapshot, setRiskSnapshot] = useState<Record<string, unknown> | null>(null);
  const [customerSnapshot, setCustomerSnapshot] = useState<Record<string, unknown> | null>(null);
  const [processingStep, setProcessingStep] = useState("");
  const [locationData, setLocationData] = useState<{ latitude: number; longitude: number } | null>(null);
  const [manualInput, setManualInput] = useState("");
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

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  const getTimestamp = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

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
      mediaStreamRef.current = null;
      setMediaStream(null);
    };
  }, []);

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
    messagesRef.current = messages;
  }, [messages]);

  // ── 3. Post-conversation pipeline (declared before STT / agent) ──
  const handleConversationComplete = useCallback(
    async (customerInput: Record<string, unknown>) => {
      setPhase("analyzing");

      try {
        let merged: Record<string, unknown> = { ...customerInput };

        const userLines = messagesRef.current
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n");

        if (userLines.trim().length > 12) {
          setProcessingStep("Normalizing spoken details...");
          try {
            const exRes = await fetch(`${BACKEND}/api/extract`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversation_text: userLines }),
            });
            if (exRes.ok) {
              const ex = (await exRes.json()) as Record<string, unknown>;
              const pick = (a: unknown, b: unknown) =>
                a !== undefined && a !== null && a !== "" && !(typeof a === "number" && a === 0) ? a : b;
              merged = {
                ...merged,
                name: pick(merged.name, ex.name) ?? "",
                age: Number(pick(merged.age, ex.age)) || 0,
                income: Number(pick(merged.income, ex.income)) || 0,
                employment: String(pick(merged.employment, ex.employment) ?? ""),
                purpose: String(
                  pick(merged.purpose, pick(merged.loan_purpose, ex.loan_purpose)) ?? "",
                ),
                loan_purpose: String(
                  pick(merged.loan_purpose, pick(merged.purpose, ex.loan_purpose)) ?? "",
                ),
                consent: Boolean(merged.consent) || Boolean(ex.consent),
              };
            }
          } catch {
            /* extraction optional */
          }
        }

        setProcessingStep("Capturing video for age verification…");
        let faceResult: Record<string, unknown> = {
          estimated_age: 0,
          confidence: 0,
          face_detected: false,
        };

        const declaredAge = Number(merged.age || 0);

        if (videoRef.current) {
          const video = videoRef.current;
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const frames: string[] = [];
            for (let i = 0; i < 3; i++) {
              ctx.drawImage(video, 0, 0);
              frames.push(canvas.toDataURL("image/jpeg", 0.85));
              if (i < 2) await new Promise((r) => setTimeout(r, 280));
            }
            try {
              setProcessingStep("Estimating age from your face vs what you said…");
              const faceRes = await fetch(`${BACKEND}/api/analyze-face`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  images: frames,
                  ...(declaredAge > 0 ? { declared_age: declaredAge } : {}),
                }),
              });
              if (faceRes.ok) {
                faceResult = await faceRes.json();
                const msg = String(faceResult.verification_message || "");
                if (msg) setProcessingStep(msg.slice(0, 120) + (msg.length > 120 ? "…" : ""));
              }
            } catch {
              /* continue */
            }
          }
        }

        setProcessingStep("Running fraud & risk checks...");
        const purpose =
          String(merged.purpose || merged.loan_purpose || "").trim() ||
          String(customerInput.purpose || customerInput.loan_purpose || "");

        const customerData = {
          name: String(merged.name || ""),
          declared_age: declaredAge,
          income: Number(merged.income || 0),
          employment: String(merged.employment || ""),
          purpose,
          consent: Boolean(merged.consent),
          estimated_age: faceResult.face_detected ? Number(faceResult.estimated_age) || null : null,
          age_confidence: faceResult.face_detected ? Number(faceResult.confidence) || null : null,
          age_match_score:
            declaredAge > 0 && faceResult.face_detected && faceResult.age_match_score != null
              ? Number(faceResult.age_match_score)
              : null,
          latitude: locationData?.latitude || null,
          longitude: locationData?.longitude || null,
        };

        const riskRes = await fetch(`${BACKEND}/api/assess-risk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: customerData,
            face_analysis: faceResult.face_detected ? faceResult : null,
            location: locationData,
          }),
        });
        const riskResult = await riskRes.json();

        setProcessingStep("Generating your personalized offer...");
        const offerRes = await fetch(`${BACKEND}/api/generate-offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: customerData,
            risk_band: riskResult.risk_band,
            fraud_flags: riskResult.fraud_flags,
          }),
        });
        const offer = await offerRes.json();

        setCustomerSnapshot({ ...customerData, raw_agent: customerInput, merged });
        setRiskSnapshot(riskResult);
        setOfferData(offer);

        const transcriptText = messagesRef.current
          .map((m) => `[${m.role}] ${m.content}`)
          .join("\n");

        try {
          const logRes = await fetch(`${BACKEND}/api/log-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionIdRef.current,
              phone: phone || undefined,
              room_url: roomUrl || undefined,
              transcript_text: transcriptText,
              messages: messagesRef.current,
              extracted: merged,
              risk: riskResult,
              offer,
              client_started_at: sessionStartedAtRef.current,
            }),
          });
          const logJson = logRes.ok ? await logRes.json() : null;
          if (logJson && typeof logJson === "object" && "session_id" in logJson) {
            sessionIdRef.current = String((logJson as { session_id: string }).session_id);
          }
        } catch {
          /* audit log best-effort */
        }

        try {
          sessionStorage.setItem(
            "vericall_last_session",
            JSON.stringify({
              session_id: sessionIdRef.current,
              at: new Date().toISOString(),
              customer: customerData,
              risk: riskResult,
              offer,
            }),
          );
        } catch {
          /* ignore */
        }

        setPhase("offer");
      } catch {
        setPhase("error");
      }
    },
    [BACKEND, locationData, phone, roomUrl],
  );

  // ── 4. Send transcript to agent (stable callback — uses ref for history) ──
  const sendToAgent = useCallback(async (text: string) => {
    try {
      const history = conversationHistoryRef.current;
      const res = await fetch(`${BACKEND}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, conversation_history: history }),
      });
      if (!res.ok) return;
      const data = await res.json();

      const userTurn = text.trim();
      const newHistory = userTurn
        ? [...history, { role: "user", content: text }, { role: "assistant", content: data.message }]
        : [...history, { role: "assistant", content: data.message }];

      conversationHistoryRef.current = newHistory;
      setConversationHistory(newHistory);

      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.message, timestamp: getTimestamp() },
      ]);

      // Speak agent response using browser TTS
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const currentSpeakingId = ++speakingIdRef.current;
        
        sttConnRef.current?.setMuted(true);
        
        const utterance = new SpeechSynthesisUtterance(data.message);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.lang = "en-IN";

        // Prevent GC of utterance before onend fires
        (window as any)._utterances = (window as any)._utterances || [];
        (window as any)._utterances.push(utterance);
        
        const cleanup = () => {
          setTimeout(() => {
            if (speakingIdRef.current === currentSpeakingId) {
              sttConnRef.current?.setMuted(false);
            }
          }, 300);
          (window as any)._utterances = (window as any)._utterances.filter((u: any) => u !== utterance);
        };
        
        utterance.onend = cleanup;
        utterance.onerror = cleanup;
        
        window.speechSynthesis.speak(utterance);
      }

      if (data.done && data.data) {
        setAgentData(data.data);
        handleConversationComplete(data.data);
      }
    } catch {
      // silently fail — will retry on next interval
    }
  }, [BACKEND, handleConversationComplete]);

  // ── 5. Connect Deepgram STT (via sttService) ───────────────
  useEffect(() => {
    if (phase !== "conversation" || !mediaStream) return;

    let cancelled = false;
    setSttStatus("connecting");

    (async () => {
      try {
        const tokenRes = await fetch(`${BACKEND}/api/deepgram-token`);
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
        });

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
  }, [phase, mediaStream, BACKEND, sendToAgent]);

  // ── Manual text input fallback ────────────────────────────
  const handleManualSend = () => {
    if (!manualInput.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: manualInput, timestamp: getTimestamp() }]);
    sendToAgent(manualInput);
    setManualInput("");
  };

  return (
    <main className="relative min-h-screen animated-gradient-bg overflow-hidden">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

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
              <span className="text-xs text-emerald-400 font-medium">Listening</span>
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
              <h2 className="text-xl font-semibold text-white mb-2">Connecting your camera...</h2>
              <p className="text-sm text-slate-400">Please allow camera and microphone access</p>
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
                <div className="mt-4 flex gap-2">
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
              )}
            </div>
          )}

          {phase === "offer" && offerData && (
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

        {/* Right: Transcript Panel */}
        <div className="lg:w-[380px] w-full h-[300px] lg:h-auto glass border-t lg:border-t-0 lg:border-l border-white/[0.06]">
          <TranscriptPanel
            messages={messages}
            isListening={isListening}
            interimText={interimText}
          />
        </div>
      </div>
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
