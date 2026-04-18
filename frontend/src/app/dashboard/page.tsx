"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AuditSession {
  session_id?: string;
  logged_at?: string;
  phone?: string;
  campaign_id?: string;
  campaign_link?: string;
  loan_type?: string;
  offer?: { status?: string; loan_amount?: number; monthly_emi?: number };
  risk?: { risk_band?: string; risk_score?: number; eligible?: boolean };
  bureau?: { bureau_score?: number; score_band?: string };
  propensity?: { score?: number; band?: string };
  extracted?: Record<string, unknown>;
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [lastLocal, setLastLocal] = useState<AuditSession | null>(null);
  const [error, setError] = useState("");
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("vantage_last_session");
      if (raw) setLastLocal(JSON.parse(raw) as AuditSession);
    } catch {
      setLastLocal(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${backend}/api/audit/recent?limit=15`);
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { sessions?: AuditSession[] };
        if (!cancelled) setSessions(data.sessions || []);
      } catch {
        if (!cancelled) setError("Could not load audit log. Is the backend running?");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  return (
    <main className="relative min-h-screen animated-gradient-bg overflow-hidden px-4 py-10">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Applications dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">Recent sessions from the JSONL audit log</p>
          </div>
          <Link href="/" className="btn-primary text-sm !py-2 !px-4">
            New application
          </Link>
        </div>

        {lastLocal && (
          <div className="glass-card p-5 mb-6 border border-indigo-500/20">
            <h2 className="text-sm font-semibold text-indigo-300 mb-2">This browser — last session</h2>
            <p className="text-xs text-slate-500 mb-3 font-mono">{String(lastLocal.session_id)}</p>
            <dl className="grid grid-cols-2 gap-2 text-sm text-slate-300">
              <dt className="text-slate-500">Status</dt>
              <dd>{lastLocal.offer?.status || "—"}</dd>
              <dt className="text-slate-500">Campaign</dt>
              <dd>{lastLocal.campaign_id || "—"}</dd>
              <dt className="text-slate-500">Risk</dt>
              <dd>
                {lastLocal.risk?.risk_band} ({lastLocal.risk?.risk_score ?? "—"})
              </dd>
              <dt className="text-slate-500">Loan type</dt>
              <dd>{lastLocal.loan_type || "—"}</dd>
              <dt className="text-slate-500">Amount</dt>
              <dd>
                {lastLocal.offer?.loan_amount != null
                  ? `₹${Number(lastLocal.offer.loan_amount).toLocaleString("en-IN")}`
                  : "—"}
              </dd>
            </dl>
          </div>
        )}

        {error && <p className="text-amber-400 text-sm mb-4">{error}</p>}

        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] text-sm font-semibold text-slate-200">
            Recent sessions (server)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Propensity</th>
                  <th className="px-4 py-3">Bureau</th>
                  <th className="px-4 py-3">Offer</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 && !error && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No sessions logged yet. Complete a call to create an audit entry.
                    </td>
                  </tr>
                )}
                {sessions.map((s) => (
                  <tr key={s.session_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {s.logged_at ? new Date(s.logged_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs truncate max-w-[140px]">
                      {s.session_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs truncate max-w-[160px]">
                      {s.campaign_id || s.campaign_link || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.risk?.risk_band}
                      {s.risk?.risk_score != null && (
                        <span className="text-slate-500"> ({s.risk.risk_score})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.propensity?.score != null
                        ? `${Math.round(Number(s.propensity.score) * 100)}%`
                        : "—"}
                      {s.propensity?.band && (
                        <span className="text-slate-500"> ({s.propensity.band})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.bureau?.bureau_score ?? "—"}
                      {s.bureau?.score_band && (
                        <span className="text-slate-500"> ({s.bureau.score_band})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{s.offer?.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
