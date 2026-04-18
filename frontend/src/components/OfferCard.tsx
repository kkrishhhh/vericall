"use client";

import { motion } from "framer-motion";

interface Verification {
  label: string;
  value: string;
  verified: boolean;
  icon: string;
}

interface FraudFlagRow {
  flag?: string;
  severity?: string;
  details?: string;
}

interface OfferCardProps {
  status: string;
  loanAmount: number;
  tenureMonths: number;
  interestRate: number;
  monthlyEmi: number;
  processingFee: number;
  confidenceScore: number;
  riskBand?: string;
  riskScore?: number;
  fraudFlags?: FraudFlagRow[];
  customerSummary?: {
    name?: string;
    declared_age?: number;
    income?: number;
    employment?: string;
    purpose?: string;
  };
  verificationSummary: {
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
    liveness_passed?: boolean;
  };
  onClose?: () => void;
}

export default function OfferCard({
  status,
  loanAmount,
  tenureMonths,
  interestRate,
  monthlyEmi,
  processingFee,
  confidenceScore,
  riskBand,
  riskScore,
  fraudFlags,
  customerSummary,
  verificationSummary: v,
  onClose,
}: OfferCardProps) {
  const isApproved = status === "PRE-APPROVED";
  const isReview = status === "NEEDS_REVIEW";

  const statusConfig = {
    "PRE-APPROVED": {
      color: "text-emerald-400",
      bg: "from-emerald-500/20 to-emerald-600/5",
      border: "border-emerald-500/30",
      icon: "✅",
      glow: "shadow-emerald-500/20",
    },
    NEEDS_REVIEW: {
      color: "text-amber-400",
      bg: "from-amber-500/20 to-amber-600/5",
      border: "border-amber-500/30",
      icon: "⚠️",
      glow: "shadow-amber-500/20",
    },
    DECLINED: {
      color: "text-red-400",
      bg: "from-red-500/20 to-red-600/5",
      border: "border-red-500/30",
      icon: "❌",
      glow: "shadow-red-500/20",
    },
  };

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.DECLINED;

  const declared = customerSummary?.declared_age;
  const matchPct =
    v.age_match_score != null && v.age_match_score > 0
      ? Math.round(v.age_match_score * 100)
      : null;

  const verifications: Verification[] = [
    {
      label: "Face vs claimed age",
      value:
        v.age_estimate != null && declared
          ? `Looks ~${Math.round(v.age_estimate)} yrs · you said ${declared}${
              matchPct != null ? ` · CV match ${matchPct}%` : ""
            }`
          : v.age_estimate != null
            ? `Estimated ~${Math.round(v.age_estimate)} yrs (no claim to compare)`
            : "No face / age from video",
      verified: v.age_verified || false,
      icon: "👤",
    },
    {
      label: "Liveness Check",
      value: v.liveness_passed ? "PASSED — emotion detected" : "FAILED — no liveness signal",
      verified: v.liveness_passed || false,
      icon: "🧬",
    },
    {
      label: "Location",
      value: v.location_verified ? "India — Verified" : "Not verified",
      verified: v.location_verified || false,
      icon: "📍",
    },
    {
      label: "Income declared",
      value: v.income_declared ? `₹${v.income_declared.toLocaleString("en-IN")}/mo` : "—",
      verified: v.income_verified || false,
      icon: "💰",
    },
    {
      label: "Employment",
      value: v.employment || "—",
      verified: !!(v.employment && v.income_verified),
      icon: "💼",
    },
    {
      label: "Verbal consent",
      value: v.consent_captured ? "Captured & logged" : "Not received",
      verified: v.consent_captured || false,
      icon: "🎙️",
    },
    {
      label: "Fraud detection",
      value: v.no_fraud_flags ? "No fraud flags detected" : "Flags detected",
      verified: v.no_fraud_flags || false,
      icon: "🛡️",
    },
  ];

  const formatCurrency = (n: number) =>
    `₹${n.toLocaleString("en-IN")}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="w-full max-w-md mx-auto"
    >
      <div
        className={`glass-card overflow-hidden shadow-2xl ${cfg.glow}`}
        style={{ boxShadow: `0 0 50px ${isApproved ? "rgba(16,185,129,0.15)" : isReview ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)"}` }}
      >
        {/* Status Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={`bg-gradient-to-r ${cfg.bg} px-6 py-5 border-b ${cfg.border}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-400 font-medium">Application Status</span>
              <div className={`text-2xl font-bold ${cfg.color} flex items-center gap-2 mt-1`}>
                <span>{cfg.icon}</span>
                <span>{status.replace("_", " ")}</span>
              </div>
            </div>
            {onClose && (
              <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>

        {/* Extracted profile + risk (compact) */}
        {(customerSummary || riskBand !== undefined) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="px-6 py-4 border-b border-white/[0.06] space-y-3"
          >
            {customerSummary && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Extracted profile
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-300">
                  <dt className="text-slate-500">Name</dt>
                  <dd className="truncate">{customerSummary.name || "—"}</dd>
                  <dt className="text-slate-500">Age</dt>
                  <dd>{customerSummary.declared_age || "—"}</dd>
                  <dt className="text-slate-500">Income</dt>
                  <dd>
                    {customerSummary.income
                      ? `₹${Number(customerSummary.income).toLocaleString("en-IN")}/mo`
                      : "—"}
                  </dd>
                  <dt className="text-slate-500">Employment</dt>
                  <dd className="truncate">{customerSummary.employment || "—"}</dd>
                  <dt className="text-slate-500">Purpose</dt>
                  <dd className="truncate col-span-2">{customerSummary.purpose || "—"}</dd>
                </dl>
              </div>
            )}
            {(riskBand !== undefined || riskScore !== undefined) && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Risk</span>
                {riskBand && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                      riskBand === "LOW"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : riskBand === "MEDIUM"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {riskBand}
                  </span>
                )}
                {riskScore !== undefined && (
                  <span className="text-xs text-slate-400">
                    Score <span className="text-slate-200 font-mono">{riskScore}</span>
                    <span className="text-slate-500"> /100</span>
                  </span>
                )}
              </div>
            )}
            {fraudFlags && fraudFlags.length > 0 && (
              <ul className="space-y-1.5 max-h-28 overflow-y-auto">
                {fraudFlags.map((f, i) => (
                  <li key={i} className="text-xs text-amber-200/90 leading-snug">
                    <span className="font-medium text-amber-400">{f.flag}</span>
                    {f.severity && (
                      <span className="text-slate-500"> ({f.severity})</span>
                    )}
                    {f.details && <span className="text-slate-400"> — {f.details}</span>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {/* Loan Details */}
        {(isApproved || isReview) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="px-6 py-5 border-b border-white/[0.06]"
          >
            <div className="text-center mb-4">
              <span className="text-sm text-slate-400">Loan Amount</span>
              <div className="text-4xl font-bold text-white mt-1">
                {formatCurrency(loanAmount)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                <div className="text-lg font-semibold text-white">{tenureMonths}</div>
                <div className="text-xs text-slate-400 mt-0.5">Months</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                <div className="text-lg font-semibold text-white">{interestRate}%</div>
                <div className="text-xs text-slate-400 mt-0.5">p.a.</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                <div className="text-lg font-semibold text-white">
                  {formatCurrency(monthlyEmi)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">EMI/mo</div>
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-slate-500">
              Processing Fee: {formatCurrency(processingFee)}
            </div>
          </motion.div>
        )}

        {/* Verification Summary */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="px-6 py-5 border-b border-white/[0.06]"
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Verification Summary</h3>
          <div className="space-y-2.5">
            {verifications.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.12 }}
                className="flex items-center gap-3"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.8 + i * 0.12, type: "spring", stiffness: 300 }}
                >
                  {item.verified ? (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">✓</span>
                  ) : (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs">!</span>
                  )}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{item.icon}</span>
                    <span className="text-sm text-slate-200">{item.label}:</span>
                    <span className="text-sm text-slate-400 truncate">{item.value}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Confidence Score */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="px-6 py-5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-300">Overall Confidence Score</span>
            <span className={`text-lg font-bold ${confidenceScore >= 0.7 ? "text-emerald-400" : confidenceScore >= 0.4 ? "text-amber-400" : "text-red-400"}`}>
              {confidenceScore.toFixed(2)} / 1.00
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/[0.05] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${confidenceScore * 100}%` }}
              transition={{ delay: 1.5, duration: 1, ease: "easeOut" }}
              className={`h-full rounded-full ${
                confidenceScore >= 0.7
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : confidenceScore >= 0.4
                  ? "bg-gradient-to-r from-amber-500 to-amber-400"
                  : "bg-gradient-to-r from-red-500 to-red-400"
              }`}
            />
          </div>
        </motion.div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white/[0.02] text-center">
          <p className="text-xs text-slate-500">
            Powered by Vantage AI · Poonawalla Fincorp · All decisions are pre-qualifications only
          </p>
        </div>
      </div>
    </motion.div>
  );
}
