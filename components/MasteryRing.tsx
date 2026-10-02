"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Props = {
  value: number;
  size?: number;
  conceptSlug?: string;
  /** When true, shows a small caption under the ring. */
  showLabel?: boolean;
};

type MasteryEvent = {
  conceptSlug?: string;
  mastery?: number;
};

function ringColor(value: number): string {
  if (value >= 0.7) return "var(--success)";
  if (value >= 0.4) return "var(--warning)";
  return "var(--error)";
}

export default function MasteryRing({
  value,
  size = 56,
  conceptSlug,
  showLabel,
}: Props) {
  const [display, setDisplay] = useState(value);
  // Bumped on every live event so the pulse replays, including when the value
  // happens to land back where it started.
  const [pulseKey, setPulseKey] = useState(0);
  // Suppresses the pulse for the first render, where `display` is seeded from
  // the server value rather than earned during this visit.
  const isFirstRender = useRef(true);

  useEffect(() => {
    setDisplay(value);
  }, [value]);

  useEffect(() => {
    if (!conceptSlug) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<MasteryEvent>).detail;
      if (
        detail &&
        detail.conceptSlug === conceptSlug &&
        typeof detail.mastery === "number"
      ) {
        setDisplay(detail.mastery);
        if (!isFirstRender.current) {
          setPulseKey((k) => k + 1);
        }
        isFirstRender.current = false;
      }
    };

    window.addEventListener("learnova:mastery-update", handler);
    return () => window.removeEventListener("learnova:mastery-update", handler);
  }, [conceptSlug]);

  const clamped = Math.max(0, Math.min(1, display));
  const stroke = Math.max(4, Math.round(size * 0.09));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <motion.div
      className="flex flex-col items-center"
      // One short pop on each live gain, so the update reads as a reward
      // rather than a silent number change.
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      key={pulseKey}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Mastery ${Math.round(clamped * 100)}%`}
        style={{ display: "block" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor(clamped)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 100, damping: 22, duration: 0.6 }}
          style={{ transform: `rotate(-90deg)`, transformOrigin: "center" }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.26}
          fontFamily="var(--font-heading)"
          fontWeight={700}
          fill="var(--ink)"
        >
          {Math.round(clamped * 100)}%
        </text>
      </svg>
      {showLabel && (
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-inkfaint">
          Mastery
        </span>
      )}
    </motion.div>
  );
}