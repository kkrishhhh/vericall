"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedDownloadProps {
  className?: string;
  isAnimating?: boolean;
  onAnimationComplete?: () => void;
}

const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const randomInt = (max: number) => Math.floor(Math.random() * max);

export function AnimatedDownload({
  className,
  isAnimating = false,
  onAnimationComplete,
}: AnimatedDownloadProps) {
  const [progress, setProgress] = useState(0);
  const [displayText, setDisplayText] = useState("READY".split(""));
  const [targetText, setTargetText] = useState("READY");
  const [isTextAnimating, setIsTextAnimating] = useState(false);
  const [textIterations, setTextIterations] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const easing = shouldReduceMotion ? "linear" : "easeOut";
  const duration = shouldReduceMotion ? 0.35 : 2.2;

  useEffect(() => {
    const nextTarget = isAnimating ? "DOWNLOADING PDF" : "READY";
    if (nextTarget !== targetText) {
      setTargetText(nextTarget);
      setTextIterations(0);
      setIsTextAnimating(true);
    }
  }, [isAnimating, targetText]);

  useEffect(() => {
    if (!isTextAnimating) return;

    const interval = setInterval(() => {
      if (textIterations < targetText.length) {
        setDisplayText(() =>
          targetText.split("").map((letter, index) =>
            letter === " "
              ? letter
              : index <= textIterations
                ? targetText[index]
                : ALPHABETS[randomInt(26)],
          ),
        );
        setTextIterations((prev) => prev + 0.12);
        return;
      }

      setIsTextAnimating(false);
      setDisplayText(targetText.split(""));
      clearInterval(interval);
    }, 700 / (Math.max(targetText.length, 1) * 8));

    return () => clearInterval(interval);
  }, [isTextAnimating, targetText, textIterations]);

  useEffect(() => {
    if (!isAnimating) {
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 1;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, duration * 10);

    return () => clearInterval(interval);
  }, [isAnimating, duration]);

  useEffect(() => {
    if (isAnimating && progress >= 100) {
      const timer = setTimeout(() => {
        onAnimationComplete?.();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isAnimating, progress, onAnimationComplete]);

  return (
    <motion.div
      className={cn(
        "w-full max-w-md rounded-2xl border border-indigo-200/70 bg-white/95 p-5 shadow-[0_20px_70px_rgba(27,43,107,0.22)]",
        className,
      )}
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: easing }}
    >
      <div className="mb-2 flex items-center">
        <div className={cn("relative -mt-2 flex h-14 w-8 items-center justify-center overflow-hidden") }>
          <motion.div
            className="absolute"
            animate={
              isAnimating
                ? { y: [0, 8, 0], opacity: [0.7, 1, 0.7] }
                : { y: 0, opacity: 0.7 }
            }
            transition={{ duration: 1.2, repeat: isAnimating ? Infinity : 0, ease: "easeInOut" }}
          >
            <ChevronDown size={20} className="text-[#2563EB]" />
          </motion.div>
          <motion.div
            className="absolute"
            animate={
              isAnimating
                ? { y: [10, 18, 10], opacity: [0.5, 0.9, 0.5] }
                : { y: 10, opacity: 0.5 }
            }
            transition={{ duration: 1.2, repeat: isAnimating ? Infinity : 0, ease: "easeInOut", delay: 0.22 }}
          >
            <ChevronDown size={20} className="text-[#1B2B6B]" />
          </motion.div>
        </div>

        <div className="ml-3 flex-1">
          <div className="inline-flex min-h-8 items-center rounded-lg bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] px-3 py-1.5">
            {displayText.map((letter, index) => (
              <motion.span
                key={`${targetText}-${index}`}
                className={cn("font-mono text-sm font-bold text-white", letter === " " ? "w-2" : "")}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {letter}
              </motion.span>
            ))}
            {isAnimating && (
              <motion.span
                className="ml-1 font-mono text-sm font-bold text-white"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                ...
              </motion.span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3 h-1 w-full rounded-full bg-gradient-to-r from-[#1B2B6B] to-[#2563EB]" />

      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        <span>Download Progress</span>
        <span>{progress}%</span>
      </div>

      <div className="h-3 w-full rounded-full border border-indigo-200 bg-indigo-50 p-[3px]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#1B2B6B] to-[#2563EB]"
          animate={{ width: `${progress}%` }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: easing }}
          initial={{ width: "0%" }}
        />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {isAnimating ? "Preparing your KYC review PDF..." : "Ready to download your KYC review PDF."}
      </p>
    </motion.div>
  );
}
