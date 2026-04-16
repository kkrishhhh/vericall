"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AuditSession {
  session_id: string;
  logged_at?: string;
  phone?: string;
  extracted?: {
    name?: string;
    age?: number;
    income?: number;
    employment?: string;
    purpose?: string;
    aadhaar_photo_base64?: string;
  };
  risk?: {
    risk_band?: string;
    risk_score?: number;
    kyc_status?: string;
    risk_flag?: string;
    document_verification?: {
      matches: boolean;
      reason: string;
    };
  };
  offer?: {
    status?: string;
    loan_amount?: number;
    interest_rate?: number;
    tenure_options?: number[];
  };
}

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${backend}/api/audit/recent?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError("Could not load applications. Please ensure the backend is running.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const stats = {
    total: sessions.length,
    approved: sessions.filter((s) => s.offer?.status === "APPROVED").length,
    rejected: sessions.filter((s) => s.offer?.status === "REJECTED").length,
    highRisk: sessions.filter((s) => s.risk?.risk_band === "HIGH" || s.risk?.risk_band === "CRITICAL").length,
  };

  return (
    <main className="relative min-h-screen animated-gradient-bg overflow-hidden flex flex-col font-sans">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Header */}
      <header className="relative z-10 glass border-b border-white/[0.06] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center glow-primary">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">VeriCall Admin</h1>
            <p className="text-xs text-indigo-300 font-medium uppercase tracking-wider">Banker Operations Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={fetchSessions}
            className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-300 hover:bg-white/[0.1] transition"
            title="Refresh"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <div className="h-8 w-[1px] bg-white/[0.1]" />
          <div className="flex items-center gap-3">
             <div className="text-right">
                <p className="text-sm font-medium text-white">Aditya Birla (Reviewer)</p>
                <p className="text-[10px] text-slate-400">Poonawalla Fincorp Ltd.</p>
             </div>
             <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold">
                AB
             </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 p-8 overflow-y-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Applications" value={stats.total} icon="📝" />
          <StatCard title="Approved" value={stats.approved} icon="✅" color="text-emerald-400" />
          <StatCard title="Rejected" value={stats.rejected} icon="❌" color="text-rose-400" />
          <StatCard title="High Risk Flags" value={stats.highRisk} icon="⚠️" color="text-amber-400" />
        </div>

        {error && (
          <div className="glass-card border-rose-500/30 p-4 mb-6 flex items-center gap-3 text-rose-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* Applications Table */}
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
            <h2 className="text-lg font-semibold text-white">Recent Loan Applications</h2>
            <div className="flex gap-2">
              <span className="px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300 uppercase font-bold tracking-widest">Live Updates Enabled</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.01]">
                  <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Applicant</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Risk Analysis</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Loan Amount</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Date / Time</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-bold text-slate-500 tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading && sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-8 h-8 text-indigo-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-slate-400 text-sm">Loading applications...</p>
                      </div>
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                      No applications found. New sessions will appear here automatically.
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr key={session.session_id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-800 border border-white/[0.1] flex items-center justify-center text-xs font-bold text-slate-300">
                            {session.extracted?.name?.charAt(0) || "?"}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{session.extracted?.name || "Unknown Applicant"}</p>
                            <p className="text-xs text-slate-400">{session.phone || "No phone"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={session.offer?.status || "IN_PROGRESS"} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <RiskBadge level={session.risk?.risk_band || "UNKNOWN"} />
                          {session.risk?.risk_score !== undefined && (
                            <p className="text-[10px] text-slate-500 font-mono">Score: {session.risk.risk_score}/100</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-slate-200">
                          {session.offer?.loan_amount 
                            ? `\u20B9${session.offer.loan_amount.toLocaleString("en-IN")}` 
                            : "\u2014"}
                        </p>
                        <p className="text-[10px] text-slate-500">{session.extracted?.purpose || "Personal"}</p>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {session.logged_at ? new Date(session.logged_at).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        }) : "\u2014"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={`/admin/${session.session_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/20 hover:text-indigo-300 transition"
                        >
                          Details
                          <svg className="w-3 h-3 translate-x-0 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ title, value, icon, color = "text-white" }: { title: string; value: number; icon: string; color?: string }) {
  return (
    <div className="glass-card p-6 border-white/[0.05] hover:border-indigo-500/20 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <span className="text-2xl">{icon}</span>
        <div className="p-1.5 rounded-md bg-white/[0.03] group-hover:bg-indigo-500/10 transition">
          <svg className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
      </div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">{title}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    IN_PROGRESS: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    HOLD: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  const labels: Record<string, string> = {
    APPROVED: "Approved",
    REJECTED: "Rejected",
    IN_PROGRESS: "In Review",
    HOLD: "On Hold",
  };

  const currentStyle = styles[status] || styles.HOLD;
  const currentLabel = labels[status] || status;

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${currentStyle}`}>
      {currentLabel}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    HIGH: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    CRITICAL: "bg-purple-500/10 text-purple-400 border-purple-500/20 glow-accent",
  };

  const currentStyle = styles[level] || "bg-slate-500/10 text-slate-400 border-slate-500/20";

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentStyle}`}>
      {level} RISK
    </span>
  );
}
