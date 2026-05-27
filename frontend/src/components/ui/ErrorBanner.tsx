import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface ErrorBannerProps {
  message: string;
  className?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, className, onDismiss }: ErrorBannerProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-2xl border transition-all duration-300",
        "bg-red-500/10 border-red-500/20 text-red-200",
        "backdrop-blur-md shadow-lg shadow-red-500/5",
        "animate-[panelFadeIn_0.3s_ease_backwards]",
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        <svg
          className="w-5 h-5 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div className="flex-1 text-sm font-medium leading-relaxed">{message}</div>
      {(onDismiss || true) && (
        <button
          onClick={() => {
            setVisible(false);
            if (onDismiss) onDismiss();
          }}
          className="flex-shrink-0 text-red-400 hover:text-red-200 transition-colors p-1 rounded-lg hover:bg-red-500/20"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
