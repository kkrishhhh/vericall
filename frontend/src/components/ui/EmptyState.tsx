import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, className, icon }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 rounded-3xl border border-slate-800 bg-slate-900/30 backdrop-blur-md",
        "animate-[panelFadeIn_0.5s_ease_backwards]",
        className
      )}
    >
      <div className="mb-4 text-slate-500">
        {icon || (
          <svg
            className="w-12 h-12 stroke-current opacity-60"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-bold text-slate-200 mb-1">{title}</h3>
      {description && <p className="text-xs text-slate-500 max-w-sm leading-relaxed">{description}</p>}
    </div>
  );
}

export default EmptyState;
