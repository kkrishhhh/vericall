"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp?: string;
}

interface TranscriptPanelProps {
  messages: Message[];
  isListening: boolean;
  interimText?: string;
  isWaitingForAI?: boolean;
  customerName?: string;
  manualInput?: string;
  onManualInputChange?: (value: string) => void;
  onManualSend?: () => void;
  onQuickReply?: (value: string) => void;
  isMicMuted?: boolean;
  isCameraOff?: boolean;
}

function MicrophoneGlyph({ animated = false }: { animated?: boolean }) {
  if (animated) {
    return (
      <div className="flex h-4 items-end gap-0.5">
        <span className="h-2 w-1 rounded-full bg-indigo-500 animate-[pulse_1.1s_ease-in-out_infinite]" />
        <span className="h-3.5 w-1 rounded-full bg-indigo-500 animate-[pulse_1.1s_ease-in-out_150ms_infinite]" />
        <span className="h-2.5 w-1 rounded-full bg-indigo-500 animate-[pulse_1.1s_ease-in-out_300ms_infinite]" />
      </div>
    );
  }

  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 18a4 4 0 004-4V8a4 4 0 10-8 0v6a4 4 0 004 4zm0 0v3m-3 0h6" />
    </svg>
  );
}

export default function TranscriptPanel({
  messages,
  isListening,
  interimText,
  isWaitingForAI = false,
  customerName = "Nausheen",
  manualInput = "",
  onManualInputChange,
  onManualSend,
  onQuickReply,
  isMicMuted = false,
  isCameraOff = false,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, interimText, isWaitingForAI]);

  const statusLabel = isWaitingForAI ? "Processing" : isListening ? "Listening" : "Response Ready";
  const statusTone = isWaitingForAI ? "bg-amber-100 text-amber-700 border-amber-200" : isListening ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-indigo-100 text-indigo-700 border-indigo-200";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-white/80 backdrop-blur-xl shadow-[0_20px_80px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-4 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Vantage AI</p>
          <p className="text-xs text-slate-500">{isListening ? "Listening live" : "Waiting for your answer"}</p>
        </div>

        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${statusTone}`}>
          {isListening && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
          {statusLabel}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {messages.length === 0 && !interimText && !isWaitingForAI && (
            <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-100 text-[#1B2B6B]">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-900">We&apos;re ready to continue.</p>
            <p className="mt-1 text-xs text-slate-500">Use the chips below or type your answer in the input bar.</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <motion.div
                key={`${msg.role}-${i}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[84%] rounded-3xl border px-4 py-3 shadow-sm ${isUser ? "border-[#1B2B6B]/10 bg-gradient-to-br from-[#1B2B6B] to-[#2563EB] text-white" : "border-slate-200/80 bg-gradient-to-br from-slate-50 to-sky-50 text-slate-800"}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${isUser ? "bg-white/15 text-white" : "bg-white text-[#1B2B6B]"}`}>
                      {isUser ? "You" : "VA"}
                    </span>
                    <span className={`text-xs font-semibold ${isUser ? "text-white/90" : "text-[#1B2B6B]"}`}>
                      {isUser ? "You" : "Vantage AI"}
                    </span>
                    {msg.timestamp && (
                      <span className={`text-[11px] ${isUser ? "text-white/70" : "text-slate-500"}`}>{msg.timestamp}</span>
                    )}
                  </div>
                  <p className={`text-sm leading-relaxed ${isUser ? "text-white" : "text-slate-700"}`}>{msg.content}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {interimText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="max-w-[84%] rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 text-slate-800 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#1B2B6B] to-[#2563EB] text-[10px] font-bold text-white">VA</span>
                <span className="text-xs font-semibold text-[#1B2B6B]">Vantage AI is typing...</span>
                <span className="text-[11px] text-slate-500">speaking</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-700 italic break-words">{interimText}</p>
            </div>
          </motion.div>
        )}

        {isWaitingForAI && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="max-w-[84%] rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 text-slate-800 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#1B2B6B] to-[#2563EB] text-[10px] font-bold text-white">VA</span>
                <span className="text-xs font-semibold text-[#1B2B6B]">Vantage AI is typing...</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:300ms]" />
                <span className="ml-2 text-xs text-slate-500">Processing your response...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200/70 px-4 py-4 sm:px-5">
        <div className="relative rounded-full border border-slate-200 bg-white/90 shadow-[0_12px_40px_rgba(27,43,107,0.08)]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-600">
            {isListening && !isMicMuted ? <MicrophoneGlyph animated /> : <MicrophoneGlyph />}
          </div>

          <input
            type="text"
            value={manualInput}
            onChange={(e) => onManualInputChange?.(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onManualSend?.()}
            placeholder="Type or speak your answer..."
            className="h-14 w-full rounded-full border-0 bg-transparent px-12 pr-28 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />

          <button
            type="button"
            onClick={onManualSend}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(27,43,107,0.25)] transition hover:-translate-y-0.5"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}