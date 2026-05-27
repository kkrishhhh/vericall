import React from "react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-3",
    xl: "w-16 h-16 border-4",
  };

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-t-transparent border-indigo-500",
          sizeClasses[size]
        )}
        style={{
          borderLeftColor: "rgba(99, 102, 241, 0.2)",
          borderRightColor: "rgba(99, 102, 241, 0.2)",
          borderBottomColor: "rgba(99, 102, 241, 0.2)",
        }}
      />
    </div>
  );
}

export default LoadingSpinner;
