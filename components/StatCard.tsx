"use client";

import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

type Props = {
  icon: ElementType;
  value: ReactNode;
  label: string;
  sublabel?: string;
  /** CSS color string used for the icon. */
  color: string;
  /** Optional navigation target; renders the card as a link. */
  href?: string;
};

/** A compact stat card used on the dashboard top strip and profile stats. */
export default function StatCard({
  icon: Icon,
  value,
  label,
  sublabel,
  color,
  href,
}: Props) {
  const inner = (
    <div className="flex items-center gap-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-2xl leading-none">{value}</span>
        <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-inkmuted">
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 block truncate text-xs text-inkfaint">
            {sublabel}
          </span>
        )}
      </span>
    </div>
  );

  const card = (
    <div className="card flex items-center justify-between">
      {inner}
      {href && (
        <span className="shrink-0 text-inkfaint" aria-hidden="true">
          →
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <motion.div variants={fadeInUp}>
        <Link href={href} className="block" style={{ textDecoration: "none" }}>
          <div className="transition-transform hover:-translate-y-0.5">
            {card}
          </div>
        </Link>
      </motion.div>
    );
  }

  return <motion.div variants={fadeInUp}>{card}</motion.div>;
}