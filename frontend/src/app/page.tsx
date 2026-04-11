"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleStart = async () => {
    if (phone.length < 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${backendUrl}/api/create-room`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json();
      router.push(`/call?room=${encodeURIComponent(data.room_url)}&phone=${encodeURIComponent(phone)}`);
    } catch {
      setError("Unable to start session. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center animated-gradient-bg overflow-hidden">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full max-w-lg mx-auto px-6">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 mb-6 glow-primary">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold gradient-text mb-3">VeriCall</h1>
          <p className="text-lg text-slate-400 font-light">
            AI-Powered Video Loan Origination
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-xs text-slate-500 tracking-wider uppercase">Powered by</span>
            <span className="text-sm font-semibold text-indigo-400">Poonawalla Fincorp</span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          <h2 className="text-xl font-semibold text-white mb-2">
            Start Your Loan Application
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Get pre-approved in under 5 minutes through a live AI video call.
            No paperwork. No waiting.
          </p>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { icon: "🎥", label: "Live Video KYC" },
              { icon: "🤖", label: "AI-Powered Agent" },
              { icon: "⚡", label: "Instant Decision" },
              { icon: "🔒", label: "Bank-Grade Security" },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
              >
                <span className="text-lg">{f.icon}</span>
                <span className="text-xs text-slate-300 font-medium">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Phone Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Mobile Number
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-4 rounded-l-xl bg-white/[0.05] border border-r-0 border-white/[0.1] text-sm text-slate-400">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                placeholder="Enter your phone number"
                className="flex-1 px-4 py-3 rounded-r-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm"
              />
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>

          {/* CTA Button */}
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full btn-primary flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </>
            ) : (
              <>
                Start Application
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {/* Trust indicators */}
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              RBI Compliant
            </span>
            <span>•</span>
            <span>End-to-End Encrypted</span>
            <span>•</span>
            <span>₹0 Application Fee</span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-8">
          © 2026 VeriCall by TenzorX · Poonawalla Fincorp Hackathon
        </p>
        <p className="text-center mt-3">
          <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
            Applications dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
