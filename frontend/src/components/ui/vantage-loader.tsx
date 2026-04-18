"use client";

import Image from "next/image";

interface VantageLoaderProps {
  /** Optional text below the loader */
  text?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show the logo above the boxes */
  showLogo?: boolean;
}

/**
 * Premium 3D isometric box loader with VANTAGE branding.
 * Used globally across the site for all loading states.
 */
export default function VantageLoader({
  text,
  size = "md",
  showLogo = true,
}: VantageLoaderProps) {
  const scale = size === "sm" ? 0.6 : size === "lg" ? 1.2 : 1;

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {showLogo && (
        <div className="flex items-center gap-2 animate-pulse">
          <Image
            src="/vantage-logo.png"
            alt="VANTAGE"
            width={size === "sm" ? 24 : size === "lg" ? 40 : 32}
            height={size === "sm" ? 24 : size === "lg" ? 40 : 32}
            className="object-contain"
          />
          <span
            className="font-bold tracking-wider text-slate-300"
            style={{ fontSize: size === "sm" ? 10 : size === "lg" ? 16 : 12 }}
          >
            VANTAGE
          </span>
        </div>
      )}
      <div className="vantage-loader" style={{ transform: `scale(${scale})` }}>
        <div className="vantage-box vantage-box-1">
          <div className="vantage-side-left" />
          <div className="vantage-side-right" />
          <div className="vantage-side-top" />
        </div>
        <div className="vantage-box vantage-box-2">
          <div className="vantage-side-left" />
          <div className="vantage-side-right" />
          <div className="vantage-side-top" />
        </div>
        <div className="vantage-box vantage-box-3">
          <div className="vantage-side-left" />
          <div className="vantage-side-right" />
          <div className="vantage-side-top" />
        </div>
        <div className="vantage-box vantage-box-4">
          <div className="vantage-side-left" />
          <div className="vantage-side-right" />
          <div className="vantage-side-top" />
        </div>
      </div>
      {text && (
        <p
          className="text-slate-400 font-medium animate-pulse"
          style={{ fontSize: size === "sm" ? 11 : size === "lg" ? 15 : 13 }}
        >
          {text}
        </p>
      )}
    </div>
  );
}
