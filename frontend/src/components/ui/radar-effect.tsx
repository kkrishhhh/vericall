"use client";

import React from "react";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

interface CircleProps extends React.HTMLAttributes<HTMLDivElement> {
  idx: number;
}

export const Circle = ({ className, idx, ...rest }: CircleProps) => {
  return (
    <motion.div
      {...rest}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: idx * 0.1, duration: 0.2 }}
      className={twMerge(
        "absolute inset-0 left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-200/80",
        className,
      )}
    />
  );
};

export const Radar = ({ className }: { className?: string }) => {
  const circles = new Array(8).fill(1);

  return (
    <div className={twMerge("relative flex h-24 w-24 items-center justify-center rounded-full", className)}>
      <style>{`
        @keyframes radar-spin {
          from { transform: rotate(20deg); }
          to   { transform: rotate(380deg); }
        }
        .animate-radar-spin {
          animation: radar-spin 8s linear infinite;
        }
      `}</style>

      <div
        style={{ transformOrigin: "right center" }}
        className="animate-radar-spin absolute right-1/2 top-1/2 z-40 flex h-[5px] w-[320px] items-end justify-center overflow-hidden bg-transparent"
      >
        <div className="relative z-40 h-[1px] w-full bg-gradient-to-r from-transparent via-blue-600 to-transparent" />
      </div>

      {circles.map((_, idx) => (
        <Circle
          key={`circle-${idx}`}
          idx={idx}
          style={{
            height: `${(idx + 1) * 4.5}rem`,
            width: `${(idx + 1) * 4.5}rem`,
            border: `1px solid rgba(37, 99, 235, ${1 - (idx + 1) * 0.1})`,
          }}
        />
      ))}
    </div>
  );
};

export const IconContainer = ({
  icon,
  text,
  delay,
}: {
  icon?: React.ReactNode;
  text?: string;
  delay?: number;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, delay: delay ?? 0 }}
      className="relative z-50 flex flex-col items-center justify-center space-y-2"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-white shadow-inner">
        {icon}
      </div>
      <div className="rounded-md px-2 py-1">
        <div className="text-center text-[11px] font-semibold text-blue-700">{text}</div>
      </div>
    </motion.div>
  );
};
