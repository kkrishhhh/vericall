"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import MacOSDock, { type DockItem } from "@/components/ui/mac-os-dock";
import VantageLoader from "@/components/ui/vantage-loader";

interface AuditSession {
  session_id: string;
  logged_at?: string;
  phone?: string;
  extracted?: {
    name?: string;
    purpose?: string;
  };
  risk?: {
    risk_band?: string;
    risk_score?: number;
  };
  offer?: {
    status?: string;
    loan_amount?: number;
  };
}

export default function AdminContainer() {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem("adminToken"));
    setRole(localStorage.getItem("adminRole"));
  }, []);

  const handleLogin = (newToken: string, newRole: string) => {
    localStorage.setItem("adminToken", newToken);
    localStorage.setItem("adminRole", newRole);
    setToken(newToken);
    setRole(newRole);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    setToken(null);
    setRole(null);
  };

  if (!token) return <AdminLogin onLogin={handleLogin} />;
  return <DashboardContent token={token} role={role} onLogout={handleLogout} />;
}

// ── LOGIN SCREEN ─────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: (token: string, role: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${backend}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error("Invalid credentials");
      const data = await res.json();
      onLogin(data.token, data.role);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-root" style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
      {/* LEFT PANEL - Login Form */}
      <div
        style={{
          width: "50%",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          background: "linear-gradient(165deg, #050510 0%, #0a0a1f 40%, #0d0f25 100%)",
          overflow: "hidden",
        }}
      >
        {/* Animated gradient orbs */}
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)", filter: "blur(80px)", animation: "loginOrb1 8s ease-in-out infinite alternate", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", filter: "blur(80px)", animation: "loginOrb2 10s ease-in-out infinite alternate", pointerEvents: "none" }} />

        {/* Grid pattern */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />

        {/* Main Content */}
        <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "420px", padding: "0 32px", opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          {/* Vantage Logo */}
          <div style={{ marginBottom: "48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "8px" }}>
              <Image src="/vantage-logo.png" alt="Vantage" width={44} height={44} style={{ objectFit: "contain" }} />
              <div>
                <h2 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", background: "linear-gradient(135deg, #fff 0%, #94a3b8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.2 }}>VANTAGE</h2>
                <p style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>Admin Console</p>
              </div>
            </div>
          </div>

          {/* Welcome text */}
          <div style={{ marginBottom: "36px" }}>
            <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2, letterSpacing: "-0.03em", marginBottom: "12px" }}>Welcome back</h1>
            <p style={{ fontSize: "15px", color: "#64748b", lineHeight: 1.6 }}>Authorized PFL personnel only. Sign in to manage KYC verifications, review applications, and monitor loan operations.</p>
          </div>

          {/* Login Form Card */}
          <div style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "32px", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 32px 64px -16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
            <form onSubmit={handleSubmit}>
              {/* Username */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#94a3b8", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Username</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#475569", display: "flex", alignItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </div>
                  <input id="admin-username" type="text" placeholder="Enter your username" value={username} onChange={(e) => setUsername(e.target.value)} required
                    style={{ width: "100%", padding: "14px 16px 14px 48px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#f1f5f9", fontSize: "14px", fontWeight: 500, outline: "none", transition: "all 0.3s ease", fontFamily: "inherit" }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#94a3b8", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Password</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#475569", display: "flex", alignItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </div>
                  <input id="admin-password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required
                    style={{ width: "100%", padding: "14px 48px 14px 48px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#f1f5f9", fontSize: "14px", fontWeight: 500, outline: "none", transition: "all 0.3s ease", fontFamily: "inherit" }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: "#475569", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0, transition: "color 0.2s ease" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")} onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}>
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ marginBottom: "20px", padding: "12px 16px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", gap: "10px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  <span style={{ color: "#f87171", fontSize: "13px", fontWeight: 500 }}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button id="admin-login-submit" type="submit" disabled={loading}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: loading ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.3s ease", position: "relative", overflow: "hidden", letterSpacing: "0.02em", fontFamily: "inherit", boxShadow: loading ? "none" : "0 8px 24px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.15)" }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = loading ? "none" : "0 8px 24px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.15)"; }}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    Authenticating...
                  </span>
                ) : "Sign In"}
              </button>
            </form>
          </div>

          {/* Powered by */}
          <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.5 }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Powered by</span>
              <Image src="/pfl-logo.png" alt="Poonawalla Fincorp" width={100} height={24} style={{ objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.6 }} />
            </div>
            <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b", fontWeight: 500, textDecoration: "none", transition: "color 0.2s ease", padding: "6px 0" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#a5b4fc")} onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
              Back to Website
            </a>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Background Image */}
      <div style={{ width: "50%", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
        <Image src="/pfl-office.jpg" alt="Poonawalla Fincorp Office" fill priority style={{ objectFit: "cover", objectPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #050510 0%, rgba(5,5,16,0.3) 25%, rgba(5,5,16,0.05) 55%, rgba(5,5,16,0.2) 100%)", zIndex: 1 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top, rgba(5,5,16,0.85) 0%, transparent 100%)", zIndex: 1 }} />
        <div style={{ position: "absolute", bottom: "48px", left: "48px", right: "48px", zIndex: 2, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "100px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", marginBottom: "20px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#6366f1", boxShadow: "0 0 8px rgba(99,102,241,0.6)" }} />
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#a5b4fc", letterSpacing: "0.06em", textTransform: "uppercase" }}>AI-Powered KYC Platform</span>
          </div>
          <h2 style={{ fontSize: "32px", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.3, letterSpacing: "-0.02em", marginBottom: "12px" }}>Intelligent Video KYC<br /><span style={{ color: "#a5b4fc" }}>for Modern Banking</span></h2>
          <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: 1.7, maxWidth: "480px" }}>RBI V-CIP compliant verification with real-time fraud detection, liveness analysis, and multilingual AI agents.</p>
        </div>
        {/* Floating stats */}
        <div style={{ position: "absolute", top: "50%", right: "48px", transform: mounted ? "translateY(-50%)" : "translateY(-50%) translateX(20px)", zIndex: 2, display: "flex", flexDirection: "column", gap: "12px", opacity: mounted ? 1 : 0, transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s" }}>
          <div style={{ padding: "14px 20px", borderRadius: "14px", background: "rgba(10,10,30,0.6)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div>
              <p style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Verification Rate</p>
              <p style={{ fontSize: "20px", fontWeight: 800, color: "#10b981", lineHeight: 1.2 }}>98.5%</p>
            </div>
          </div>
          <div style={{ padding: "14px 20px", borderRadius: "14px", background: "rgba(10,10,30,0.6)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
            </div>
            <div>
              <p style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Avg. Process Time</p>
              <p style={{ fontSize: "20px", fontWeight: 800, color: "#a5b4fc", lineHeight: 1.2 }}>4.2 min</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes loginOrb1 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(40px, 30px) scale(1.15); } }
        @keyframes loginOrb2 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(-30px, -20px) scale(1.1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #475569; font-weight: 400; }
        @media (max-width: 900px) {
          .admin-login-root { flex-direction: column !important; }
          .admin-login-root > div:first-child { width: 100% !important; min-height: auto !important; padding-top: 48px !important; padding-bottom: 48px !important; }
          .admin-login-root > div:last-child { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── DOCK ICON GENERATOR ──────────────────────────────────────

function makeDockIcon(bg1: string, bg2: string, paths: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><rect width="512" height="512" rx="110" fill="url(#g)"/>` + paths + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DOCK_ITEMS: DockItem[] = [
  { id: "live", name: "Live Applications", icon: makeDockIcon("#1B2B6B", "#2946A8", '<rect x="155" y="100" width="202" height="270" rx="18" fill="none" stroke="white" stroke-width="20"/><line x1="200" y1="190" x2="312" y2="190" stroke="white" stroke-width="16" stroke-linecap="round" opacity="0.9"/><line x1="200" y1="240" x2="312" y2="240" stroke="white" stroke-width="16" stroke-linecap="round" opacity="0.9"/><line x1="200" y1="290" x2="275" y2="290" stroke="white" stroke-width="16" stroke-linecap="round" opacity="0.6"/><circle cx="256" cy="430" r="18" fill="white" opacity="0.15"/>') },
  { id: "queue", name: "Human Review Queue", icon: makeDockIcon("#4338CA", "#6366F1", '<path d="M256 90 L380 175 L380 310 Q380 405 256 440 Q132 405 132 310 L132 175 Z" fill="none" stroke="white" stroke-width="20" stroke-linejoin="round"/><line x1="256" y1="210" x2="256" y2="310" stroke="white" stroke-width="22" stroke-linecap="round"/><circle cx="256" cy="368" r="14" fill="white"/>') },
  { id: "analytics", name: "Platform Analytics", icon: makeDockIcon("#1D4ED8", "#3B82F6", '<rect x="130" y="290" width="56" height="120" rx="10" fill="white" opacity="0.8"/><rect x="228" y="200" width="56" height="210" rx="10" fill="white"/><rect x="326" y="140" width="56" height="270" rx="10" fill="white" opacity="0.9"/><line x1="110" y1="415" x2="402" y2="415" stroke="white" stroke-width="8" stroke-linecap="round" opacity="0.25"/>') },
  { id: "chat", name: "AI Banker Chat", icon: makeDockIcon("#4F46E5", "#7C3AED", '<rect x="110" y="130" width="220" height="160" rx="30" fill="white" opacity="0.9"/><polygon points="170,290 210,290 180,330" fill="white" opacity="0.9"/><circle cx="185" cy="210" r="13" fill="#4F46E5"/><circle cx="225" cy="210" r="13" fill="#4F46E5" opacity="0.6"/><circle cx="265" cy="210" r="13" fill="#4F46E5" opacity="0.3"/>') },
  { id: "fraud", name: "Fraud Intelligence", icon: makeDockIcon("#991B1B", "#DC2626", '<path d="M256 80 L395 175 L395 300 Q395 405 256 445 Q117 405 117 300 L117 175 Z" fill="none" stroke="white" stroke-width="18" stroke-linejoin="round"/><ellipse cx="256" cy="275" rx="60" ry="40" fill="none" stroke="white" stroke-width="14"/><circle cx="256" cy="275" r="18" fill="white"/>') },
  { id: "home", name: "Back to Home", icon: makeDockIcon("#334155", "#475569", '<path d="M256 110 L410 245 L375 245 L375 400 L290 400 L290 310 L222 310 L222 400 L137 400 L137 245 L102 245 Z" fill="none" stroke="white" stroke-width="20" stroke-linejoin="round"/>') },
];

// ── PANEL ANIMATION ──────────────────────────────────────────

const panelVariants = { initial: { opacity: 0, scale: 0.92, y: 40 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: -20 } };
const panelTransition = { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const };

// ── SHARED CHAT STATE ────────────────────────────────────────

const CHAT_CHIPS = ["How many KYCs today?", "Approval rate this week?", "Any high-risk sessions?", "Show rejected applications"];

function useChatState(token: string) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{ q: string; a: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const handleAsk = async (question?: string) => {
    const q = (question || query).trim();
    if (!q) return;
    setLoading(true);
    setQuery("");
    try {
      const res = await fetch(`${backend}/api/analytics/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ question: q }) });
      const data = await res.json();
      setMessages((prev) => [...prev, { q, a: data.answer || "Hmm, I couldn't process that. Try asking differently!" }]);
    } catch {
      setMessages((prev) => [...prev, { q, a: "Oops - couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return { query, setQuery, messages, loading, scrollRef, handleAsk };
}

// ── CHAT UI (shared renderer) ────────────────────────────────

function ChatMessagesUI({ messages, loading, scrollRef, query, setQuery, handleAsk }: {
  messages: { q: string; a: string }[]; loading: boolean; scrollRef: React.RefObject<HTMLDivElement | null>;
  query: string; setQuery: (v: string) => void; handleAsk: (q?: string) => void;
}) {
  return (
    <div className="flex flex-col h-full gap-3">
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-5 px-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(99,102,241,0.3) transparent" }}>
        {/* Welcome */}
        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20 bg-[#0a0d1f] border border-[rgba(99,102,241,0.2)]"><Image src="/vantage-logo.png" alt="V" width={20} height={20} className="object-contain" /></div>
          <div className="max-w-[75%] px-4 py-3 rounded-[18px_18px_18px_4px] bg-gradient-to-br from-[rgba(27,43,107,0.4)] to-[rgba(27,43,107,0.2)] border border-[rgba(99,102,241,0.15)]">
            <p className="text-[13px] text-slate-300 leading-relaxed">Hey! I&apos;m your VANTAGE assistant. I can pull live stats from the database - just ask me in plain English. Like <span className="text-blue-400 font-medium">&quot;how many KYCs were approved this week?&quot;</span></p>
          </div>
        </div>

        {/* Chips */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2 pl-11">
            {CHAT_CHIPS.map((chip) => (
              <button key={chip} onClick={() => handleAsk(chip)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 cursor-pointer bg-[rgba(37,99,235,0.08)] border-[rgba(37,99,235,0.2)] text-blue-400 hover:bg-[rgba(37,99,235,0.15)] hover:border-[rgba(37,99,235,0.4)] hover:scale-[1.03]">
                {chip}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="flex justify-end gap-3">
              <div className="max-w-[75%] px-4 py-3 rounded-[18px_18px_4px_18px] bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-600/20">
                <p className="text-[13px] text-white leading-relaxed">{m.q}</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20 bg-[#0a0d1f] border border-[rgba(99,102,241,0.2)]"><Image src="/vantage-logo.png" alt="V" width={20} height={20} className="object-contain" /></div>
              <div className="max-w-[75%] px-4 py-3 rounded-[18px_18px_18px_4px] bg-gradient-to-br from-[rgba(27,43,107,0.4)] to-[rgba(27,43,107,0.2)] border border-[rgba(99,102,241,0.15)]">
                <p className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">{m.a}</p>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20 bg-[#0a0d1f] border border-[rgba(99,102,241,0.2)]"><Image src="/vantage-logo.png" alt="V" width={20} height={20} className="object-contain" /></div>
            <div className="px-4 py-3 rounded-[18px_18px_18px_4px] bg-[rgba(27,43,107,0.2)] border border-[rgba(99,102,241,0.1)]">
              <div className="flex gap-1.5 items-center h-5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }} className="flex gap-2 flex-shrink-0">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask me anything about today's sessions..."
          className="flex-1 px-4 py-3 rounded-2xl text-sm outline-none transition-all duration-200 font-[inherit]"
          style={{ border: "1px solid rgba(27,43,107,0.3)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)")} onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(27,43,107,0.3)")} />
        <button type="submit" disabled={loading}
          className="px-5 py-3 rounded-2xl border-none text-white text-sm font-bold transition-all duration-200 font-[inherit] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: loading ? "rgba(37,99,235,0.3)" : "linear-gradient(135deg, #2563EB, #1B2B6B)", boxShadow: loading ? "none" : "0 4px 16px rgba(37,99,235,0.3)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </form>
    </div>
  );
}

// ── FLOATING CHAT FAB ────────────────────────────────────────

function FloatingChatFAB({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const chat = useChatState(token);

  return (
    <>
      <motion.button onClick={() => setOpen(!open)}
        className="fixed bottom-28 right-8 z-40 flex items-center gap-2.5 px-5 py-3 rounded-full text-white text-sm font-semibold cursor-pointer border-none shadow-2xl"
        style={{ background: "linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)", boxShadow: "0 8px 32px rgba(37,99,235,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset", pointerEvents: "auto" }}
        whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.97 }}
        animate={{ boxShadow: open ? "0 4px 16px rgba(37,99,235,0.2)" : ["0 8px 32px rgba(37,99,235,0.4)", "0 8px 40px rgba(99,102,241,0.5)", "0 8px 32px rgba(37,99,235,0.4)"] }}
        transition={{ boxShadow: { duration: 2, repeat: Infinity } }}>
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            Ask VANTAGE
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-44 right-8 z-40 flex flex-col"
            style={{ width: "420px", maxWidth: "calc(100vw - 32px)", height: "480px", maxHeight: "calc(100vh - 300px)", borderRadius: "20px", background: "rgba(10, 13, 31, 0.97)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid rgba(99,102,241,0.2)", boxShadow: "0 32px 80px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)", pointerEvents: "auto" }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(27,43,107,0.2)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shadow-lg shadow-blue-500/20 bg-[#0a0d1f] border border-[rgba(99,102,241,0.2)]"><Image src="/vantage-logo.png" alt="V" width={20} height={20} className="object-contain" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-100">VANTAGE Assistant</p>
                  <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Online</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <ChatMessagesUI messages={chat.messages} loading={chat.loading} scrollRef={chat.scrollRef} query={chat.query} setQuery={chat.setQuery} handleAsk={chat.handleAsk} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── WELCOME STATE ────────────────────────────────────────────

function WelcomeState({ token, roleName }: { token: string; roleName: string }) {
  const [stats, setStats] = useState<any>(null);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => {
    fetch(`${backend}/api/analytics/overview`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then(setStats).catch(() => {});
  }, [token, backend]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "stretch", pointerEvents: "none", zIndex: 10 }}>
      <div style={{ position: "absolute", inset: 0, background: "url('/pfl-office.jpg') center/cover no-repeat", opacity: 0.15, filter: "blur(4px) grayscale(50%)", mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(8,12,26,0.95) 0%, rgba(8,12,26,0.6) 40%, transparent 100%)" }} />
      <div className="relative z-20 flex flex-col justify-center pl-[8%] w-full max-w-[1600px] mx-auto">
        <div className="mb-16 animate-[panelFadeIn_0.8s_ease_backwards]">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg mb-5" style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)" }}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ boxShadow: "0 0 8px #10b981" }} />
            <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wide">System Online</span>
          </div>
          <h2 className="text-5xl md:text-[56px] font-extrabold text-white tracking-tight leading-tight mb-4">Welcome back,<br /><span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">{roleName}.</span></h2>
          <p className="text-lg text-slate-400 max-w-[480px] leading-relaxed font-normal">VANTAGE is currently monitoring live operations. Select an application from the dock to begin your shift.</p>
        </div>
        {stats && (
          <div className="flex flex-wrap gap-4 md:gap-6 animate-[panelFadeIn_0.8s_ease_backwards_0.2s]">
            {[
              { label: "Approval Rate", value: `${stats.approval_rate || 0}%`, color: "#10b981" },
              { label: "Pending Queue", value: stats.hold_count || 0, color: "#6366f1" },
              { label: "Total Sessions", value: stats.total_sessions || 0, color: "#f1f5f9" },
            ].map((s) => (
              <div key={s.label} className="px-5 py-4 md:px-6 md:py-5 rounded-2xl min-w-[140px] md:min-w-[160px]" style={{ background: "rgba(10,13,31,0.6)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mb-2">{s.label}</span>
                <span className="text-3xl md:text-4xl font-extrabold leading-none" style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <FloatingChatFAB token={token} />
    </div>
  );
}

// ── DASHBOARD ────────────────────────────────────────────────

function DashboardContent({ token, role, onLogout }: { token: string; role: string | null; onLogout: () => void }) {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const router = useRouter();
  const handleDockClick = (id: string) => { if (id === "home") { router.push("/"); return; } setActivePanel(id); };
  const closePanel = () => setActivePanel(null);
  const roleName = role?.replace("PFL_", "").replace("Role.", "") || "Officer";

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "linear-gradient(135deg, #080C1A 0%, #0F1629 50%, #0A0D1F 100%)", fontFamily: "var(--font-jakarta), system-ui, sans-serif", overflow: "hidden" }}>
      {/* Background orbs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "10%", left: "15%", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, #1B2B6B 0%, transparent 70%)", opacity: 0.04, filter: "blur(80px)", animation: "dockOrb1 20s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", top: "50%", right: "10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, #2563EB 0%, transparent 70%)", opacity: 0.04, filter: "blur(80px)", animation: "dockOrb2 25s ease-in-out infinite alternate" }} />
      </div>

      {/* Floating Header */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 45, display: "flex", justifyContent: "center", padding: "16px 20px", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: "1200px", padding: "12px 24px", background: "rgba(10, 13, 31, 0.7)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", animation: "panelFadeIn 0.8s ease backwards" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <Image src="/pfl-logo.png" alt="Poonawalla Fincorp" width={140} height={40} style={{ height: "30px", width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.12)", flexShrink: 0 }} />
            <Image src="/vantage-logo.png" alt="VANTAGE" width={120} height={30} style={{ height: "22px", width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span className="px-3 py-1 rounded-lg text-[11px] font-semibold font-mono text-slate-400" style={{ background: "rgba(27,43,107,0.3)", border: "1px solid rgba(27,43,107,0.4)" }}>{role || "PFL_OFFICER"}</span>
            <button onClick={onLogout} className="px-4 py-2 rounded-xl border-none text-white text-xs font-bold cursor-pointer transition-all duration-200 hover:translate-y-[-1px]" style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.8) 0%, rgba(153,27,27,0.8) 100%)", boxShadow: "0 4px 12px rgba(220,38,38,0.2)" }}>Sign Out</button>
          </div>
        </div>
      </header>

      {!activePanel && <WelcomeState token={token} roleName={roleName} />}

      <AnimatePresence mode="wait">
        {activePanel === "live" && <PanelShell key="live" title="Live Applications" icon="live" onClose={closePanel}><LiveApplicationsPanel /></PanelShell>}
        {activePanel === "queue" && <PanelShell key="queue" title="Human Review Queue" icon="queue" onClose={closePanel}><ReviewQueuePanel token={token} /></PanelShell>}
        {activePanel === "analytics" && <PanelShell key="analytics" title="Platform Analytics" icon="analytics" onClose={closePanel}><AnalyticsPanel token={token} /></PanelShell>}
        {activePanel === "chat" && <PanelShell key="chat" title="AI Banker Chat" icon="chat" onClose={closePanel}><ChatPanel token={token} /></PanelShell>}
        {activePanel === "fraud" && <PanelShell key="fraud" title="Fraud Intelligence" icon="fraud" onClose={closePanel}><FraudPanel /></PanelShell>}
      </AnimatePresence>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <MacOSDock items={DOCK_ITEMS} activeId={activePanel} openApps={activePanel ? [activePanel] : []} onItemClick={handleDockClick} />
      </div>

      <style jsx>{`
        @keyframes dockOrb1 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(60px, 40px) scale(1.2); } }
        @keyframes dockOrb2 { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(-50px, -30px) scale(1.15); } }
        @keyframes panelFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── PANEL SHELL ──────────────────────────────────────────────

const PANEL_ICONS: Record<string, React.ReactNode> = {
  live: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="12" y2="18" /></svg>,
  queue: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  analytics: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  chat: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  fraud: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
};

function PanelShell({ title, icon, onClose, children }: { title: string; icon: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div variants={panelVariants} initial="initial" animate="animate" exit="exit" transition={panelTransition}
      className="fixed inset-x-0 z-40 flex flex-col m-4 rounded-[20px] overflow-hidden"
      style={{ top: "60px", bottom: "100px", background: "rgba(10, 13, 31, 0.97)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid rgba(27, 43, 107, 0.25)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 32px 80px -16px rgba(0,0,0,0.6)" }}>
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-[rgba(27,43,107,0.2)] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[rgba(37,99,235,0.15)] flex items-center justify-center text-blue-400">{PANEL_ICONS[icon] || icon}</span>
          <h2 className="text-base font-bold text-slate-100 tracking-tight">{title}</h2>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 text-slate-400 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(239,68,68,0.15)] hover:border-[rgba(239,68,68,0.3)] hover:text-red-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6 md:p-7">{children}</div>
    </motion.div>
  );
}

// ── PANEL 1: LIVE APPLICATIONS ───────────────────────────────

function LiveApplicationsPanel() {
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [loading, setLoading] = useState(true);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  const fetchSessions = async () => {
    try { const res = await fetch(`${backend}/api/audit/recent?limit=50`); const data = await res.json(); setSessions(data.sessions || []); } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); const i = setInterval(fetchSessions, 10000); return () => clearInterval(i); }, []);

  const stats = {
    total: sessions.length,
    approved: sessions.filter((s) => s.offer?.status === "APPROVED" || s.offer?.status === "PRE-APPROVED").length,
    rejected: sessions.filter((s) => s.offer?.status === "REJECTED").length,
    highRisk: sessions.filter((s) => s.risk?.risk_band === "HIGH" || s.risk?.risk_band === "CRITICAL").length,
  };

  const statCards = [
    { label: "Total Apps", value: stats.total, color: "#e2e8f0", glow: "rgba(226,232,240,0.1)" },
    { label: "Approved", value: stats.approved, color: "#10b981", glow: "rgba(16,185,129,0.1)" },
    { label: "Rejected", value: stats.rejected, color: "#ef4444", glow: "rgba(239,68,68,0.1)" },
    { label: "High Risk", value: stats.highRisk, color: "#f59e0b", glow: "rgba(245,158,11,0.1)" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Live - Auto-refreshing every 10s</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {statCards.map((s) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="px-5 py-5 rounded-2xl border border-[rgba(27,43,107,0.2)] relative overflow-hidden group cursor-default" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 50%, ${s.glow}, transparent 70%)` }} />
            <div className="relative z-10">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">{s.label}</span>
              <span className="text-4xl font-extrabold leading-none tracking-tight" style={{ color: s.color }}>{s.value}</span>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="rounded-2xl border border-[rgba(27,43,107,0.2)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgba(27,43,107,0.15)] flex items-center justify-between" style={{ background: "rgba(255,255,255,0.01)" }}>
          <h3 className="text-base font-bold text-slate-100">Recent Applications</h3>
          <span className="text-xs text-slate-500 font-medium">{sessions.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[rgba(27,43,107,0.12)]">
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Applicant</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Risk</th>
                <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-20 text-center"><VantageLoader text="Loading live sessions..." /></td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No sessions found.</td></tr>
              ) : sessions.map((s, idx) => (
                <motion.tr key={s.session_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03, duration: 0.3 }}
                  className="border-b border-[rgba(27,43,107,0.08)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.02)] cursor-default">
                  <td className="px-6 py-3.5"><p className="text-sm font-semibold text-slate-200">{s.extracted?.name || "Unknown"}</p><p className="text-xs text-slate-500 mt-0.5">{s.phone || "No phone"}</p></td>
                  <td className="px-6 py-3.5"><StatusBadge status={s.offer?.status || "IN_PROGRESS"} /></td>
                  <td className="px-6 py-3.5"><RiskBadge level={s.risk?.risk_band || "UNKNOWN"} /></td>
                  <td className="px-6 py-3.5 text-right"><Link href={`/admin/${s.session_id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 bg-[rgba(37,99,235,0.1)] text-blue-400 border border-[rgba(37,99,235,0.2)] hover:bg-[rgba(37,99,235,0.2)] hover:border-[rgba(37,99,235,0.4)] no-underline">View <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></Link></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── PANEL 2: REVIEW QUEUE ────────────────────────────────────

function ReviewQueuePanel({ token }: { token: string }) {
  const queue = [
    {
      id: "hq-001",
      session_id: "sess_vantage_2026_0418_001",
      escalation_reason: "Face match confidence below threshold (62%) and Aadhaar DOB mismatch.",
    },
    {
      id: "hq-002",
      session_id: "sess_vantage_2026_0418_002",
      escalation_reason: "High-risk behavior detected: repeated camera interruptions during liveness checks.",
    },
    {
      id: "hq-003",
      session_id: "sess_vantage_2026_0418_003",
      escalation_reason: "Address proof incomplete: utility bill upload missing mandatory page.",
    },
    {
      id: "hq-004",
      session_id: "sess_vantage_2026_0418_004",
      escalation_reason: "PAN extraction confidence is low; manual document verification required.",
    },
    {
      id: "hq-005",
      session_id: "sess_vantage_2026_0418_005",
      escalation_reason: "Applicant geolocation and declared city do not match; verify current residence proof.",
    },
    {
      id: "hq-006",
      session_id: "sess_vantage_2026_0418_006",
      escalation_reason: "Income statement appears edited; bank statement requires manual authenticity check.",
    },
    {
      id: "hq-007",
      session_id: "sess_vantage_2026_0418_007",
      escalation_reason: "Multiple failed OTP attempts before success; review for potential account takeover risk.",
    },
    {
      id: "hq-008",
      session_id: "sess_vantage_2026_0418_008",
      escalation_reason: "Document glare prevented clear Aadhaar number extraction in final upload.",
    },
    {
      id: "hq-009",
      session_id: "sess_vantage_2026_0418_009",
      escalation_reason: "Voice consent phrase was incomplete in transcript; manual compliance validation needed.",
    },
  ];

  void token;

  if (queue.length === 0) return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-[rgba(99,102,241,0.1)] flex items-center justify-center mb-6">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
      </div>
      <h3 className="text-xl font-bold text-slate-100 mb-2">All Clear</h3>
      <p className="text-sm text-slate-500 max-w-md">No sessions currently require human review. All applications are being processed automatically by VANTAGE.</p>
    </motion.div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-6"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /><span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">{queue.length} Pending Review{queue.length !== 1 ? "s" : ""}</span></div>
      <div className="grid gap-3">
        {queue.map((q: any, idx: number) => (
          <motion.div key={q.id || q.session_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
            className="px-5 py-4 rounded-2xl border flex items-center justify-between gap-4 transition-all duration-200 bg-[rgba(99,102,241,0.04)] border-[rgba(99,102,241,0.15)] hover:bg-[rgba(99,102,241,0.08)] hover:border-[rgba(99,102,241,0.25)]">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-100 truncate">Session: {q.session_id}</h3>
              <p className="text-xs text-slate-400 truncate">{q.escalation_reason || "Flagged for manual review"}</p>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-[rgba(99,102,241,0.15)] text-indigo-300 text-[11px] font-bold uppercase tracking-wider flex-shrink-0">Pending</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── PANEL 3: ANALYTICS ───────────────────────────────────────

function AnalyticsPanel({ token }: { token: string }) {
  const [stats, setStats] = useState<any>(null);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => { fetch(`${backend}/api/analytics/overview`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then(setStats).catch(() => {}); }, [token]);

  if (!stats) return <div className="flex items-center justify-center py-32"><VantageLoader text="Loading platform analytics..." /></div>;

  const approvalRate = stats.approval_rate || 0;
  const rejectionRate = stats.rejection_rate || 0;
  const holdRate = stats.hold_rate || 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const approvalOffset = circumference - (approvalRate / 100) * circumference;

  const pipelineData = [
    { label: "Approved", pct: approvalRate, color: "#10b981" },
    { label: "On Hold", pct: holdRate, color: "#6366f1" },
    { label: "Rejected", pct: rejectionRate, color: "#ef4444" },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Sessions", value: stats.total_sessions, color: "#e2e8f0" },
          { label: "Approval Rate", value: `${approvalRate}%`, color: "#10b981" },
          { label: "Rejection Rate", value: `${rejectionRate}%`, color: "#ef4444" },
        ].map((s, idx) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
            className="px-5 py-5 rounded-2xl border border-[rgba(27,43,107,0.2)]" style={{ background: "rgba(255,255,255,0.02)" }}>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">{s.label}</span>
            <span className="text-4xl font-extrabold leading-none tracking-tight" style={{ color: s.color }}>{s.value}</span>
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
          className="p-8 rounded-2xl border border-[rgba(27,43,107,0.2)] flex flex-col items-center" style={{ background: "rgba(255,255,255,0.02)" }}>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Approval Rate</h3>
          <div className="relative w-44 h-44">
            <svg width="176" height="176" viewBox="0 0 180 180" className="progress-ring">
              <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
              <circle cx="90" cy="90" r={radius} fill="none" stroke="#10b981" strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={approvalOffset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1)", filter: "drop-shadow(0 0 8px rgba(16,185,129,0.3))" }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl font-extrabold text-emerald-500">{approvalRate}%</span></div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
          className="p-8 rounded-2xl border border-[rgba(27,43,107,0.2)]" style={{ background: "rgba(255,255,255,0.02)" }}>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Pipeline Breakdown</h3>
          <div className="flex items-end gap-6 h-40 pb-10">
            {pipelineData.map((bar, idx) => (
              <div key={bar.label} className="flex-1 flex flex-col items-center gap-2">
                <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(bar.pct, 4)}%` }} transition={{ delay: 0.4 + idx * 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-[60px] rounded-t-lg" style={{ background: `linear-gradient(180deg, ${bar.color} 0%, ${bar.color}88 100%)`, boxShadow: `0 4px 16px ${bar.color}33`, minHeight: "8px" }} />
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{bar.label}</span>
                <span className="text-lg font-extrabold" style={{ color: bar.color }}>{bar.pct}%</span>
              </div>
            ))}
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,0.04)" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${approvalRate}%` }} transition={{ delay: 0.6, duration: 0.8 }} style={{ background: "#10b981" }} />
            <motion.div initial={{ width: 0 }} animate={{ width: `${holdRate}%` }} transition={{ delay: 0.7, duration: 0.8 }} style={{ background: "#6366f1" }} />
            <motion.div initial={{ width: 0 }} animate={{ width: `${rejectionRate}%` }} transition={{ delay: 0.8, duration: 0.8 }} style={{ background: "#ef4444" }} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ── PANEL 4: CHAT ────────────────────────────────────────────

function ChatPanel({ token }: { token: string }) {
  const chat = useChatState(token);
  return <div className="h-full flex flex-col"><ChatMessagesUI messages={chat.messages} loading={chat.loading} scrollRef={chat.scrollRef} query={chat.query} setQuery={chat.setQuery} handleAsk={chat.handleAsk} /></div>;
}

// ── PANEL 5: FRAUD ───────────────────────────────────────────

function FraudPanel() {
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [loading, setLoading] = useState(true);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => { fetch(`${backend}/api/audit/recent?limit=50`).then((r) => r.json()).then((data) => setSessions(data.sessions || [])).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex items-center justify-center py-32"><VantageLoader text="Loading fraud intelligence..." /></div>;

  const riskCounts: Record<string, number> = {};
  sessions.forEach((s) => { const band = s.risk?.risk_band || "UNKNOWN"; riskCounts[band] = (riskCounts[band] || 0) + 1; });
  const flaggedCount = (riskCounts["HIGH"] || 0) + (riskCounts["CRITICAL"] || 0);

  const signals = [
    { name: "Low Risk", key: "LOW", color: "#10b981", severity: "Safe" },
    { name: "Medium Risk", key: "MEDIUM", color: "#6366f1", severity: "Caution" },
    { name: "High Risk", key: "HIGH", color: "#ef4444", severity: "Alert" },
    { name: "Critical Risk", key: "CRITICAL", color: "#a855f7", severity: "Critical" },
    { name: "Unknown Risk", key: "UNKNOWN", color: "#64748b", severity: "Unclassified" },
    { name: "Total Flagged", key: "__flagged__", color: "#f87171", severity: "Combined" },
  ];

  return (
    <div>
      {flaggedCount === 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[rgba(16,185,129,0.1)] flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          </div>
          <h3 className="text-lg font-bold text-emerald-500 mb-1">No Fraud Flags Detected</h3>
          <p className="text-sm text-slate-500">All recent sessions show clean risk profiles.</p>
        </motion.div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {signals.map((sig, idx) => {
          const count = sig.key === "__flagged__" ? flaggedCount : (riskCounts[sig.key] || 0);
          return (
            <motion.div key={sig.key} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.06 }}
              className="px-5 py-5 rounded-2xl border relative overflow-hidden group cursor-default transition-all duration-200 hover:scale-[1.02]"
              style={{ background: (sig.key === "HIGH" || sig.key === "CRITICAL") ? `${sig.color}08` : "rgba(255,255,255,0.02)", borderColor: `${sig.color}25` }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-200">{sig.name}</p>
                <span className="px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider" style={{ background: `${sig.color}15`, color: sig.color }}>{sig.severity}</span>
              </div>
              <p className="text-3xl font-extrabold leading-none" style={{ color: sig.color }}>{count}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── UTILITY COMPONENTS ───────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    APPROVED: { bg: "rgba(16,185,129,0.1)", color: "#10b981", border: "rgba(16,185,129,0.2)" },
    "PRE-APPROVED": { bg: "rgba(16,185,129,0.1)", color: "#10b981", border: "rgba(16,185,129,0.2)" },
    REJECTED: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", border: "rgba(239,68,68,0.2)" },
    IN_PROGRESS: { bg: "rgba(99,102,241,0.1)", color: "#818cf8", border: "rgba(99,102,241,0.2)" },
  };
  const s = map[status] || map.IN_PROGRESS;
  return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{status}</span>;
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    LOW: { bg: "rgba(16,185,129,0.1)", color: "#10b981", border: "rgba(16,185,129,0.2)" },
    MEDIUM: { bg: "rgba(99,102,241,0.1)", color: "#818cf8", border: "rgba(99,102,241,0.2)" },
    HIGH: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", border: "rgba(239,68,68,0.2)" },
    CRITICAL: { bg: "rgba(168,85,247,0.1)", color: "#a855f7", border: "rgba(168,85,247,0.2)" },
  };
  const s = map[level] || { bg: "rgba(100,116,139,0.1)", color: "#64748b", border: "rgba(100,116,139,0.2)" };
  return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{level}</span>;
}
