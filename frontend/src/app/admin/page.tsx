"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

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
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

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
    <div className="min-h-screen animated-gradient-bg flex items-center justify-center font-sans">
      <div className="glass-card p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 mb-4 glow-primary">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Banker Login</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input type="text" placeholder="Username (e.g. officer)" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" required />
          </div>
          <div>
            <input type="password" placeholder="Password (e.g. officer123)" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" required />
          </div>
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50">
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── DASHBOARD ────────────────────────────────────────────────

function DashboardContent({ token, role, onLogout }: { token: string; role: string | null; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState("applications");

  return (
    <main className="relative min-h-screen animated-gradient-bg overflow-hidden flex flex-col font-sans">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      
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
            <p className="text-xs text-indigo-300 font-medium uppercase tracking-wider">{role?.replace("Role.", "")} Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-sm font-semibold border border-rose-500/20 hover:bg-rose-500/20 transition">
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Sidebar Nav */}
        <div className="w-64 border-r border-white/[0.06] bg-black/20 p-4 flex flex-col gap-2">
          <NavButton active={activeTab === "applications"} onClick={() => setActiveTab("applications")} icon="📝" label="Live Applications" />
          <NavButton active={activeTab === "review"} onClick={() => setActiveTab("review")} icon="⚠️" label="Human Review Queue" />
          <NavButton active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} icon="📊" label="Platform Analytics" />
          <NavButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")} icon="🤖" label="AI Banker Chat" />
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {activeTab === "applications" && <ApplicationsView />}
          {activeTab === "review" && <ReviewQueueView token={token} />}
          {activeTab === "analytics" && <AnalyticsView token={token} />}
          {activeTab === "chat" && <ChatView token={token} />}
        </div>
      </div>
    </main>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${active ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`}>
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}

// ── TAB: LIVE APPLICATIONS ───────────────────────────────────

function ApplicationsView() {
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [loading, setLoading] = useState(true);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${backend}/api/audit/recent?limit=50`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); const i = setInterval(fetchSessions, 15000); return () => clearInterval(i); }, []);

  const stats = {
    total: sessions.length,
    approved: sessions.filter((s) => s.offer?.status === "APPROVED").length,
    rejected: sessions.filter((s) => s.offer?.status === "REJECTED").length,
    highRisk: sessions.filter((s) => s.risk?.risk_band === "HIGH" || s.risk?.risk_band === "CRITICAL").length,
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total Apps" value={stats.total} icon="📝" />
        <StatCard title="Approved" value={stats.approved} icon="✅" color="text-emerald-400" />
        <StatCard title="Rejected" value={stats.rejected} icon="❌" color="text-rose-400" />
        <StatCard title="High Risk" value={stats.highRisk} icon="⚠️" color="text-amber-400" />
      </div>

      <div className="glass-card overflow-hidden">
        <h2 className="px-6 py-4 border-b border-white/[0.06] text-lg font-semibold text-white bg-white/[0.02]">Recent Real-Time Applications</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.01]">
                <th className="px-6 py-4 text-[10px] uppercase text-slate-500">Applicant</th>
                <th className="px-6 py-4 text-[10px] uppercase text-slate-500">Status</th>
                <th className="px-6 py-4 text-[10px] uppercase text-slate-500">Risk</th>
                <th className="px-6 py-4 text-[10px] uppercase text-slate-500 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? <tr><td colSpan={4} className="p-8 text-center text-slate-400">Loading...</td></tr> : 
                sessions.map(s => (
                  <tr key={s.session_id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-white">{s.extracted?.name || "Unknown"}</p>
                      <p className="text-xs text-slate-400">{s.phone || "No phone"}</p>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={s.offer?.status || "IN_PROGRESS"} /></td>
                    <td className="px-6 py-4"><RiskBadge level={s.risk?.risk_band || "UNKNOWN"} /></td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/admin/${s.session_id}`} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-semibold">View</Link>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── TAB: REVIEW QUEUE ────────────────────────────────────────

function ReviewQueueView({ token }: { token: string }) {
  const [queue, setQueue] = useState<any[]>([]);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  const fetchQueue = async () => {
    const res = await fetch(`${backend}/api/review/queue`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setQueue((await res.json()).queue || []);
  };
  useEffect(() => { fetchQueue(); }, [token]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Human Override Queue</h2>
      {queue.length === 0 ? (
        <div className="glass-card p-12 text-center text-slate-400">No applications currently require human review!</div>
      ) : (
        <div className="grid gap-4">
          {queue.map(q => (
            <div key={q.id} className="glass-card p-6 border-amber-500/30 bg-amber-500/5 flex justify-between items-center">
              <div>
                <h3 className="text-white font-semibold">Session ID: {q.session_id}</h3>
                <p className="text-sm text-amber-300 mt-1">Reason: {q.escalation_reason}</p>
              </div>
              <button disabled className="btn-primary opacity-50 cursor-not-allowed text-xs">Review Details</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TAB: ANALYTICS ───────────────────────────────────────────

function AnalyticsView({ token }: { token: string }) {
  const [stats, setStats] = useState<any>(null);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => {
    fetch(`${backend}/api/analytics/overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setStats);
  }, [token]);

  if (!stats) return <p className="text-slate-400">Loading analytics...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Platform Analytics (Last 7 Days)</h2>
      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard title="Total Sessions" value={stats.total_sessions} icon="📈" />
        <StatCard title="Approval Rate" value={`${stats.approval_rate}%`} icon="🎯" color="text-emerald-400" />
        <StatCard title="Rejection Rate" value={`${stats.rejection_rate}%`} icon="🛑" color="text-rose-400" />
      </div>
      <div className="glass-card p-8">
        <h3 className="text-lg font-semibold text-white mb-4">Pipeline Status</h3>
        <p className="text-slate-400 mb-2 mt-4">We are aggregating JSON audit logs directly via SQLite to generate real-time metrics for DPDPA processing.</p>
        <div className="w-full bg-white/[0.05] rounded-full h-4 mt-6 flex overflow-hidden">
           <div className="bg-emerald-500 h-4" style={{width: `${stats.approval_rate}%`}}></div>
           <div className="bg-amber-500 h-4" style={{width: `${stats.hold_rate}%`}}></div>
           <div className="bg-rose-500 h-4" style={{width: `${stats.rejection_rate}%`}}></div>
        </div>
      </div>
    </div>
  );
}

// ── TAB: AI BANKER CHAT ──────────────────────────────────────

function ChatView({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{q: string, a: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`${backend}/api/analytics/ask`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: query })
      });
      const data = await res.json();
      setMessages([...messages, { q: query, a: data.answer || "Error processing" }]);
      setQuery("");
    } catch {
      setMessages([...messages, { q: query, a: "Server connection failed." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-6">AI Banker Assistant</h2>
      <div className="flex-1 glass-card p-6 overflow-y-auto space-y-6 mb-6">
        <div className="flex gap-4 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm">
          <span className="text-xl">🤖</span>
          <p>I am your Conversational Analytics Assistant. I run strict read-only SQL queries against the audit database securely. Ask me things like &quot;How many loans were approved?&quot;</p>
        </div>
        {messages.map((m, i) => (
          <div key={i} className="space-y-4">
            <div className="flex flex-row-reverse gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">👤</div>
              <div className="bg-white/10 px-4 py-2 rounded-2xl rounded-tr-none text-white text-sm">{m.q}</div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">🤖</div>
              <div className="bg-indigo-500/20 px-4 py-3 rounded-2xl rounded-tl-none border border-indigo-500/30 text-indigo-100 text-sm max-w-2xl whitespace-pre-wrap">{m.a}</div>
            </div>
          </div>
        ))}
        {loading && <div className="text-slate-500 text-sm italic ml-11">Agent is generating SQL and analyzing data...</div>}
      </div>
      <form onSubmit={handleAsk} className="flex gap-2">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask a question..." 
          className="flex-1 px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
        <button type="submit" disabled={loading} className="btn-primary rounded-xl px-6 font-bold disabled:opacity-50">Send</button>
      </form>
    </div>
  );
}

// ── UTILS ────────────────────────────────────────────────────

function StatCard({ title, value, icon, color = "text-white" }: { title: string; value: string | number; icon: string; color?: string }) {
  return (
    <div className="glass-card p-6 border-white/[0.05]">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">{title}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { APPROVED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20", IN_PROGRESS: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  return <span className={`px-2 py-1 rounded text-[10px] font-bold border ${styles[status] || styles.IN_PROGRESS}`}>{status}</span>;
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = { LOW: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", HIGH: "bg-rose-500/10 text-rose-400 border-rose-500/20",  CRITICAL: "bg-purple-500/10 text-purple-400 border-purple-500/20 bg-pulse" };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[level] || "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>{level}</span>;
}
