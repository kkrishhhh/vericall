"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TranscriptPanel from "@/components/TranscriptPanel";
import OfferCard from "@/components/OfferCard";

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp?: string;
}

type CallPhase = "connecting" | "conversation" | "analyzing" | "offer" | "error";

function CallPageInner() {
  const searchParams = useSearchParams();
  const roomUrl = searchParams.get("room") || ""; // eslint-disable-line @typescript-eslint/no-unused-vars

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTranscriptRef = useRef<string>("");

  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([]);
  const [offerData, setOfferData] = useState<Record<string, unknown> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [agentData, setAgentData] = useState<Record<string, unknown> | null>(null);
  const [processingStep, setProcessingStep] = useState("");
  const [locationData, setLocationData] = useState<{ latitude: number; longitude: number } | null>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  const getTimestamp = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // ── 1. Initialize camera ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase("conversation");
      } catch {
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 2. Capture geolocation ────────────────────────────────
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  // ── 3. Send transcript to agent ───────────────────────────
  const sendToAgent = useCallback(async (text: string) => {
    try {
      const res = await fetch(`${BACKEND}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, conversation_history: conversationHistory }),
      });
      if (!res.ok) return;
      const data = await res.json();

      const newHistory = [
        ...conversationHistory,
        { role: "user", content: text },
        { role: "assistant", content: data.message },
      ];
      setConversationHistory(newHistory);

      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.message, timestamp: getTimestamp() },
      ]);

      // Speak agent response using browser TTS
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(data.message);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.lang = "en-IN";
        window.speechSynthesis.speak(utterance);
      }

      if (data.done && data.data) {
        setAgentData(data.data);
        handleConversationComplete(data.data);
      }
    } catch {
      // silently fail — will retry on next interval
    }
  }, [conversationHistory, BACKEND]);

  // ── 4. Connect Deepgram STT ───────────────────────────────
  useEffect(() => {
    if (phase !== "conversation" || !mediaStreamRef.current) return;

    let audioContext: AudioContext | null = null;
    let ws: WebSocket | null = null;

    (async () => {
      try {
        // Get Deepgram token from backend
        const tokenRes = await fetch(`${BACKEND}/api/deepgram-token`);
        const { token } = await tokenRes.json();

        ws = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-IN&smart_format=true&interim_results=true&utterance_end_ms=1500&vad_events=true&token=${token}`,
        );
        ws.onopen = () => {
          setIsListening(true);
          deepgramWsRef.current = ws;

          // Set up audio streaming
          audioContext = new AudioContext({ sampleRate: 16000 });
          const source = audioContext.createMediaStreamSource(mediaStreamRef.current!);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);

          source.connect(processor);
          processor.connect(audioContext.destination);

          processor.onaudioprocess = (e) => {
            if (ws?.readyState === WebSocket.OPEN) {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
              }
              ws.send(pcm16.buffer);
            }
          };
        };

        // Send initial agent greeting
        setTimeout(() => sendToAgent(""), 1000);

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.type === "Results") {
            const transcript = data.channel?.alternatives?.[0]?.transcript || "";
            if (!transcript) return;

            if (data.is_final) {
              setInterimText("");
              if (transcript.trim()) {
                setMessages((prev) => [
                  ...prev,
                  { role: "user", content: transcript, timestamp: getTimestamp() },
                ]);
                pendingTranscriptRef.current += " " + transcript;
              }
            } else {
              setInterimText(transcript);
            }
          }

          if (data.type === "UtteranceEnd") {
            // End of speech — send accumulated transcript to agent
            const accumulated = pendingTranscriptRef.current.trim();
            if (accumulated) {
              pendingTranscriptRef.current = "";
              sendToAgent(accumulated);
            }
          }
        };

        ws.onerror = () => setIsListening(false);
        ws.onclose = () => setIsListening(false);

        // Also send on interval as fallback
        agentTimerRef.current = setInterval(() => {
          const accumulated = pendingTranscriptRef.current.trim();
          if (accumulated) {
            pendingTranscriptRef.current = "";
            sendToAgent(accumulated);
          }
        }, 8000);
      } catch {
        // STT connection failed — enable manual mode
      }
    })();



    return () => {
      ws?.close();
      audioContext?.close();
      if (agentTimerRef.current) clearInterval(agentTimerRef.current);
    };
  }, [phase, BACKEND, sendToAgent]);

  // ── 5. Post-conversation pipeline ────────────────────────
  const handleConversationComplete = async (customerInput: Record<string, unknown>) => {
    setPhase("analyzing");

    try {
      // Step 1: Face analysis
      setProcessingStep("Analyzing face for age verification...");
      let faceResult = { estimated_age: 0, confidence: 0, face_detected: false };

      if (videoRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          const imageBase64 = canvas.toDataURL("image/jpeg", 0.8);
          try {
            const faceRes = await fetch(`${BACKEND}/api/analyze-face`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: imageBase64 }),
            });
            if (faceRes.ok) faceResult = await faceRes.json();
          } catch {
            // face analysis failed — continue with defaults
          }
        }
      }

      // Step 2: Risk assessment
      setProcessingStep("Running fraud & risk checks...");
      const customerData = {
        name: String(customerInput.name || ""),
        declared_age: Number(customerInput.age || 0),
        income: Number(customerInput.income || 0),
        employment: String(customerInput.employment || ""),
        purpose: String(customerInput.purpose || ""),
        consent: Boolean(customerInput.consent),
        estimated_age: faceResult.estimated_age || null,
        age_confidence: faceResult.confidence || null,
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

      // Step 3: Generate offer
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

      setOfferData(offer);
      setPhase("offer");
    } catch {
      setPhase("error");
    }
  };

  // ── Manual text input fallback ────────────────────────────
  const [manualInput, setManualInput] = useState("");
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
          {phase === "conversation" && isListening && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-emerald-400 font-medium">Connected</span>
            </div>
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
            <OfferCard
              status={offerData.status as string}
              loanAmount={offerData.loan_amount as number}
              tenureMonths={offerData.tenure_months as number}
              interestRate={offerData.interest_rate as number}
              monthlyEmi={offerData.monthly_emi as number}
              processingFee={offerData.processing_fee as number}
              confidenceScore={offerData.confidence_score as number}
              verificationSummary={offerData.verification_summary as {
                age_verified?: boolean;
                age_estimate?: number | null;
                age_confidence?: number | null;
                location_verified?: boolean;
                income_declared?: number;
                income_verified?: boolean;
                employment?: string;
                consent_captured?: boolean;
                no_fraud_flags?: boolean;
              }}
            />
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
