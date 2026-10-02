"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ChevronRight, Lock, Play } from "lucide-react";
import MasteryRing from "@/components/MasteryRing";
import { fadeInUp } from "@/lib/motion";
import type { PathViewItem } from "@/lib/dashboard-types";

type Props = {
  pathView: PathViewItem[];
  totalConcepts: number;
};

const STATUS_STYLES: Record<
  PathViewItem["status"],
  { label: string; className: string }
> = {
  mastered: {
    label: "Mastered",
    className: "bg-success-soft text-success",
  },
  // Finished the lesson, but not strong enough on the test to call it mastered.
  // Deliberately neutral: it is a finished state, not a failure.
  completed: {
    label: "Completed",
    className: "bg-bgsubtle text-ink",
  },
  current: {
    label: "Current",
    className: "bg-primary-soft text-primary",
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-bgsubtle text-inkmuted",
  },
  locked: {
    label: "Locked",
    className: "bg-bgsubtle text-inkfaint",
  },
};

/** The "Your path" timeline: one row per concept, in order. */
export default function DashboardPath({ pathView, totalConcepts }: Props) {
  return (
    <section>
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h2 className="font-heading text-2xl">Your path</h2>
          <p className="mt-1 text-sm text-inkmuted">
            {totalConcepts} concept{totalConcepts === 1 ? "" : "s"}, in order.
            Work through each to grow your mastery.
          </p>
        </div>
        {/* The path is a route through the curriculum; the glossary is the
            whole map, including everything not on this learner's path. */}
        <Link
          href="/glossary"
          className="btn-secondary shrink-0 text-sm"
          style={{ textDecoration: "none" }}
        >
          View full glossary
          <ChevronRight size={15} />
        </Link>
      </motion.div>

      {totalConcepts === 0 ? (
        <p className="mt-4 text-inkmuted">No path generated yet. Re-run onboarding to build one.</p>
      ) : (
        <motion.ul
          className="mt-4 space-y-2"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        >
          {pathView.map((item) => {
            const style = STATUS_STYLES[item.status];
            const locked = item.status === "locked";

            // One 32px badge carries the status; the roadmap above already
            // draws the sequence, so there is no number or connector here.
            let badge: ReactNode;
            if (item.status === "mastered") {
              badge = (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-soft">
                  <Check size={16} className="text-success" strokeWidth={3} />
                </span>
              );
            } else if (item.status === "current") {
              badge = (
                <span className="pulse-primary flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                  <Play size={13} className="ml-0.5 text-white" fill="currentColor" />
                </span>
              );
            } else if (item.status === "completed") {
              badge = (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bgsubtle">
                  <Check size={15} className="text-inkmuted" strokeWidth={2.5} />
                </span>
              );
            } else if (locked) {
              badge = (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bgsubtle">
                  <Lock size={14} className="text-inkfaint" />
                </span>
              );
            } else {
              badge = (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-inkfaint" />
              );
            }

            const row = (
              <div
                className={`flex items-center gap-3 rounded-lg border border-bgsubtle bg-bgcard px-3 py-2 transition-colors ${
                  locked ? "cursor-not-allowed opacity-60" : "hover:bg-bgsubtle"
                }`}
                // A locked row is not a link, so the reason has to live here.
                title={locked ? "Complete earlier concepts to unlock" : undefined}
              >
                {badge}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`truncate text-base font-semibold ${
                        locked ? "text-inkmuted" : "text-ink"
                      }`}
                    >
                      {item.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                        item.tier === "intermediate"
                          ? "badge-tier-intermediate"
                          : "badge-tier-beginner"
                      }`}
                    >
                      {item.tierLabelText}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-inkmuted">
                    {item.why || "A concept on your learning path."}
                  </p>
                </div>

                {item.slug && (
                  <div className="shrink-0">
                    <MasteryRing value={item.score} size={40} conceptSlug={item.slug} />
                  </div>
                )}

                <span className={`status-pill shrink-0 ${style.className}`}>
                  {style.label}
                  {item.status === "current" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>

                {locked ? (
                  <span className="w-4 shrink-0" />
                ) : (
                  <ChevronRight size={16} className="shrink-0 text-inkfaint" />
                )}
              </div>
            );

            return (
              <motion.li key={item.key} variants={fadeInUp}>
                {locked ? (
                  row
                ) : (
                  <Link
                    href={`/me/lesson/${item.conceptId}`}
                    style={{ textDecoration: "none" }}
                  >
                    {row}
                  </Link>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}
