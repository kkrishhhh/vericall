"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

export interface DockItem {
  id: string;
  name: string;
  icon: string;
}

interface MacOSDockProps {
  items: DockItem[];
  activeId?: string | null;
  openApps?: string[];
  onItemClick: (id: string) => void;
}

// ── Individual Dock Icon ────────────────────────────────────

function DockIcon({
  item,
  mouseX,
  isActive,
  onClick,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  // Compute distance from cursor to icon center
  const distance = useTransform(mouseX, (val: number) => {
    const el = ref.current;
    if (!el) return 150;
    const bounds = el.getBoundingClientRect();
    return val - bounds.x - bounds.width / 2;
  });

  // Map distance → size: close = 72px, far = 52px
  const sizeSync = useTransform(distance, [-120, 0, 120], [40, 56, 40]);
  const size = useSpring(sizeSync, {
    mass: 0.1,
    stiffness: 170,
    damping: 14,
  });

  // Map distance → vertical lift
  const ySync = useTransform(distance, [-120, 0, 120], [0, -6, 0]);
  const y = useSpring(ySync, { mass: 0.1, stiffness: 170, damping: 14 });

  return (
    <motion.div
      ref={ref}
      style={{ width: size, height: size, y }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="dock-icon-slot"
    >
      {/* Tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute",
            bottom: "calc(100% + 12px)",
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            padding: "5px 12px",
            borderRadius: "8px",
            background: "rgba(10, 13, 31, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            pointerEvents: "none",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {item.name}
        </motion.div>
      )}

      {/* Icon image */}
      <img
        src={item.icon}
        alt={item.name}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "22%",
          cursor: "pointer",
          userSelect: "none",
          filter: hovered
            ? "brightness(1.12) drop-shadow(0 4px 12px rgba(0,0,0,0.4))"
            : "brightness(1) drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
          transition: "filter 0.2s ease",
        }}
      />

      {/* Active indicator dot */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            bottom: "-8px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 0 6px rgba(255,255,255,0.6)",
          }}
        />
      )}
    </motion.div>
  );
}

// ── Main Dock Component ─────────────────────────────────────

export default function MacOSDock({
  items,
  activeId,
  openApps = [],
  onItemClick,
}: MacOSDockProps) {
  const mouseX = useMotionValue(Infinity);

  return (
    <div style={{ position: "relative" }}>
      {/* Main dock bar */}
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "14px",
          padding: "10px 16px 12px 16px",
          borderRadius: "22px",
          background: "rgba(10, 13, 31, 0.55)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 24px 80px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
        }}
      >
        {items.map((item) => (
          <DockIcon
            key={item.id}
            item={item}
            mouseX={mouseX}
            isActive={activeId === item.id || openApps.includes(item.id)}
            onClick={() => onItemClick(item.id)}
          />
        ))}
      </motion.div>

      {/* Reflection below the dock */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "100%",
          left: "16px",
          right: "16px",
          height: "24px",
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.03) 0%, transparent 100%)",
          borderRadius: "0 0 22px 22px",
          transform: "scaleY(-1)",
          opacity: 0.1,
          pointerEvents: "none",
          filter: "blur(4px)",
        }}
      />
    </div>
  );
}
