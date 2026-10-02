"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { ReviewCandidate } from "@/lib/learner";
import { fadeInUp } from "@/lib/motion";

type Props = {
  /**
   * Concepts worth revisiting, computed by reviewCandidates on the server.
   * Empty while migration 013 is unapplied, which is why the card hides rather
   * than showing an empty session.
   */
  reviewCandidates: ReviewCandidate[];
};

/**
 * The review nudge. Sits above the roadmap: a note about the past is worth more
 * before the learner reads what is ahead of them, and it is the one card that
 * responds to something other than forward progress.
 */
export default function DashboardReview({ reviewCandidates }: Props) {
  if (reviewCandidates.length === 0) return null;

  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate">
      <div className="card border-l-4" style={{ borderLeftColor: "var(--primary)" }}>
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
          >
            <RotateCcw size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl">Time to review</h2>
            <p className="mt-1 text-sm text-inkmuted">
              You have {reviewCandidates.length} concept
              {reviewCandidates.length === 1 ? "" : "s"} that need revisiting.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {reviewCandidates.map((candidate) => (
                <li
                  key={candidate.conceptId}
                  className="chip bg-bgsubtle text-inkmuted text-xs"
                >
                  {candidate.title}
                </li>
              ))}
            </ul>
            <Link
              href="/me/review"
              className="btn-primary mt-4"
              style={{ textDecoration: "none" }}
            >
              Start review session
              <ChevronRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
