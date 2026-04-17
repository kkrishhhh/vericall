"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
}

export default function TranscriptPanel({
  messages,
  isListening,
  interimText,
  isWaitingForAI = false,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimText]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-sm font-semibold text-slate-200">Live Transcript</span>
        </div>
        {isListening && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-xs text-red-400 font-medium">LIVE</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !interimText && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400">Waiting for conversation to begin...</p>
            <p className="text-xs text-slate-500 mt-1">Speak naturally, the AI agent will guide you</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
              className={`transcript-bubble ${msg.role}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs font-semibold ${
                    msg.role === "agent" ? "text-indigo-400" : "text-cyan-400"
                  }`}
                >
                  {msg.role === "agent" ? "🤖 VeriCall" : "👤 You"}
                </span>
                {msg.timestamp && (
                  <span className="text-xs text-slate-500">{msg.timestamp}</span>
                )}
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">{msg.content}</p>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Interim text (live speech) */}
        {interimText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            className="transcript-bubble user"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-cyan-400">👤 You</span>
              <span className="text-xs text-slate-500 italic">speaking...</span>
            </div>
            <p className="text-sm text-slate-300 italic">{interimText}</p>
          </motion.div>
        )}

        {/* AI thinking indicator */}
        {isWaitingForAI && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="transcript-bubble agent"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-indigo-400">🤖 VeriCall</span>
              <span className="text-xs text-indigo-300">thinking...</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-slate-400">Processing your request...</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
