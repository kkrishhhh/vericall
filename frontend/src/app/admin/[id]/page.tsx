"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface AuditSession {
  session_id: string;
  logged_at?: string;
  phone?: string;
  room_url?: string;
  messages?: { role: string; content: string; timestamp?: string }[];
  extracted?: {
    name?: string;
    age?: number;
    income?: number;
    employment?: string;
    purpose?: string;
    aadhaar_photo_base64?: string;
    blood_group?: string;
  };
  risk?: {
    risk_band?: string;
    risk_score?: number;
    kyc_status?: string;
    risk_flag?: string;
    fraud_flags?: { flag: string; reason: string }[];
    document_verification?: {
      matches: boolean;
      reason: string;
      aadhaar_address?: string;
      proof_address?: string;
      name_match?: boolean;
      dob_match?: boolean;
      gender_match?: boolean;
      geo_city?: string;
      proof_city?: string;
      city_match?: boolean;
    };
  };
  offer?: {
    status?: string;
    loan_amount?: number;
    interest_rate?: number;
    tenure_options?: number[];
  };
  decision_trace?: string[];
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [session, setSession] = useState<AuditSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`${backend}/api/audit/session/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Application not found.");
          throw new Error("Failed to fetch application details.");
        }
        const data = await res.json();
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load application details.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchSession();
  }, [id, backend]);

  if (loading) {
    return (
      <div className="min-h-screen animated-gradient-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-indigo-300 font-medium animate-pulse">Retrieving Profile...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen animated-gradient-bg flex items-center justify-center p-8">
        <div className="glass-card p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Oops! Something went wrong</h2>
          <p className="text-slate-400 mb-6">{error || "Could not find the requested application."}</p>
          <Link href="/admin" className="btn-primary block w-full text-center">Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isApproved = session.offer?.status === "APPROVED";
  const riskColor = getRiskColor(session.risk?.risk_band);

  return (
    <main className="relative min-h-screen animated-gradient-bg overflow-hidden flex flex-col font-sans">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {/* Header */}
      <header className="relative z-10 glass border-b border-white/[0.06] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-300 hover:bg-white/[0.1] transition group">
            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Application Review</h1>
            <p className="text-xs text-slate-400 font-mono">{session.session_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={session.offer?.status || "IN_PROGRESS"} />
          <RiskBadge level={session.risk?.risk_band || "UNKNOWN"} />
        </div>
      </header>

      {/* Main Grid */}
      <div className="relative z-10 flex-1 p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-y-auto">
        
        {/* Left Column: Profile & Photo */}
        <div className="space-y-8">
          {/* Profile Card */}
          <section className="glass-card overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Applicant Profile</h2>
            </div>
            <div className="p-6 space-y-4">
              <ProfileItem label="Full Name" value={session.extracted?.name} />
              <ProfileItem label="Phone" value={session.phone} />
              <ProfileItem label="Declared Age" value={session.extracted?.age} suffix="years" />
              <ProfileItem label="Employment" value={session.extracted?.employment} />
              <ProfileItem label="Monthly Income" value={session.extracted?.income} prefix="\u20B9" isCurrency />
              <ProfileItem label="Loan Purpose" value={session.extracted?.purpose} />
              <ProfileItem label="Blood Group" value={session.extracted?.blood_group} />
            </div>
          </section>

          {/* Captured Image */}
          <section className="glass-card overflow-hidden">
             <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">KYC Captured Identity</h2>
             </div>
             <div className="p-6 flex flex-col items-center">
                {session.extracted?.aadhaar_photo_base64 ? (
                  <div className="relative group">
                    <img 
                      src={session.extracted.aadhaar_photo_base64} 
                      alt="Captured Aadhaar" 
                      className="rounded-xl border border-white/[0.1] shadow-2xl max-h-[300px] transition-transform group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center pointer-events-none">
                       <span className="text-[10px] font-bold text-white uppercase bg-indigo-500 px-2 py-1 rounded">Vision Match OCR Active</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-video bg-white/[0.03] border border-dashed border-white/[0.1] rounded-xl flex flex-col items-center justify-center text-slate-500">
                    <svg className="w-10 h-10 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-xs">Physical document capture unavailable</p>
                  </div>
                )}
                <p className="mt-4 text-[10px] text-slate-500 font-mono uppercase">Reference: KYC-Vision-Liveness-Check</p>
             </div>
          </section>
        </div>

        {/* Middle Column: Analysis & Decisions */}
        <div className="space-y-8">
          {/* Decision Results */}
          <section className="glass-card overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Automated Decisioning</h2>
            </div>
            <div className="p-6">
               <div className={`p-4 rounded-xl border mb-6 ${isApproved ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                  <p className="text-xs font-bold text-slate-300 uppercase mb-1">Final Status</p>
                  <p className={`text-2xl font-extrabold ${isApproved ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {session.offer?.status || "PENDING"}
                  </p>
               </div>

               <div className="space-y-4">
                  <ProfileItem label="Approved Amount" value={session.offer?.loan_amount} prefix="\u20B9" isCurrency />
                  <ProfileItem label="Interest Rate" value={session.offer?.interest_rate} suffix="%" />
                  <ProfileItem label="Tenure Range" value={session.offer?.tenure_options?.join(", ") || "\u2014"} suffix="months" />
               </div>

               <div className="mt-6 pt-6 border-t border-white/[0.06]">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Decision Reasoning</p>
                  <ul className="space-y-2">
                    {session.decision_trace?.map((trace, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                        <span className="text-indigo-500 font-bold">\u2022</span>
                        {trace}
                      </li>
                    ))}
                    {!session.decision_trace?.length && <li className="text-xs text-slate-500 italic">No automated trace recorded</li>}
                  </ul>
               </div>
            </div>
          </section>

          {/* Documents Section */}
          <section className="glass-card overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Generated Documents</h2>
            </div>
            <div className="p-6 grid grid-cols-1 gap-3">
               <DocumentLink 
                 title="Loan Application Form" 
                 format="PDF" 
                 href={`${backend}/api/documents/${session.session_id}/application/pdf`}
                 icon="📄"
               />
               <DocumentLink 
                 title="Application Summary" 
                 format="HTML" 
                 href={`${backend}/api/documents/${session.session_id}/application/html`}
                 icon="🔗"
               />
            </div>
          </section>
        </div>

        {/* Right Column: Risk & Verification */}
        <div className="space-y-8">
           {/* Risk Analysis */}
           <section className="glass-card overflow-hidden">
             <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Fraud Risk Engine</h2>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${riskColor}`}>
                  {session.risk?.risk_band || "N/A"}
                </span>
             </div>
             <div className="p-6">
                <div className="mb-6">
                  <div className="flex justify-between items-end mb-1">
                    <p className="text-xs text-slate-400">Composite Risk Score</p>
                    <p className={`text-lg font-bold ${riskColor.split(' ')[1]}`}>{session.risk?.risk_score || 0}/100</p>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${getRiskProgressColor(session.risk?.risk_band)}`} 
                      style={{ width: `${session.risk?.risk_score || 0}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Fraud Flags</p>
                  {session.risk?.fraud_flags && session.risk.fraud_flags.length > 0 ? (
                    <div className="space-y-3">
                      {session.risk.fraud_flags.map((flag, i) => (
                        <div key={i} className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                           <p className="text-xs font-bold text-rose-300 mb-0.5">{flag.flag}</p>
                           <p className="text-[10px] text-rose-300/70">{flag.reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                       <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                       </svg>
                       <span className="text-xs text-emerald-400 font-medium font-sans">No critical flags detected</span>
                    </div>
                  )}
                </div>
             </div>
           </section>

           {/* Verification Checklist */}
           <section className="glass-card overflow-hidden">
             <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Verification Checklist</h2>
             </div>
             <div className="p-6 space-y-3">
                <CheckItem label="Face Match (ID vs Liveness)" checked={session.risk?.kyc_status === "VERIFIED"} />
                <CheckItem label="Address Match (Aadhaar vs Proof)" checked={session.risk?.document_verification?.matches} />
                <CheckItem label="City Geofence Match" checked={session.risk?.document_verification?.city_match !== false} />
                <CheckItem label="Aadhaar Authenticity" checked={session.risk?.document_verification?.matches} />
                <CheckItem label="Name Integrity check" checked={session.risk?.document_verification?.name_match !== false} />
             </div>
           </section>
        </div>

      </div>
    </main>
  );
}

function ProfileItem({ label, value, prefix = "", suffix = "", isCurrency = false }: { label: string; value: string | number | undefined; prefix?: string; suffix?: string; isCurrency?: boolean }) {
  const displayValue = value !== undefined && value !== null 
    ? (isCurrency && typeof value === 'number' ? value.toLocaleString("en-IN") : value) 
    : "\u2014";
  
  return (
    <div>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-slate-200">{prefix}{displayValue} {suffix}</p>
    </div>
  );
}

function DocumentLink({ title, format, href, icon }: { title: string; format: string; href: string; icon: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-indigo-500/30 transition group"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-xs font-bold text-slate-200">{title}</p>
          <p className="text-[10px] text-slate-500 font-mono tracking-tighter">{format} GENERATED</p>
        </div>
      </div>
      <svg className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
}

function CheckItem({ label, checked }: { label: string; checked: boolean | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      {checked ? (
        <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-rose-500/50" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
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
  const currentStyle = styles[status] || styles.HOLD;
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${currentStyle}`}>
      {status}
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
    <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${currentStyle}`}>
      {level} RISK
    </span>
  );
}

function getRiskColor(level: string | undefined): string {
  switch (level) {
    case "LOW": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "MEDIUM": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "HIGH": return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    case "CRITICAL": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    default: return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
}

function getRiskProgressColor(level: string | undefined): string {
  switch (level) {
    case "LOW": return "bg-emerald-500";
    case "MEDIUM": return "bg-amber-500";
    case "HIGH": return "bg-rose-500";
    case "CRITICAL": return "bg-purple-500";
    default: return "bg-slate-500";
  }
}
