"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Award,
  Check,
  ChevronRight,
  Compass,
  Flame,
  Lock,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import MasteryRing from "@/components/MasteryRing";
import FeedbackCard from "@/components/FeedbackCard";
import CertificateClaim from "@/components/CertificateClaim";
import Roadmap, { type RoadmapProps } from "@/components/Roadmap";
import type { ReviewCandidate } from "@/lib/learner";
import { fadeInUp } from "@/lib/motion";
import type { Tier } from "@/lib/tier";

export type PathViewItem = {
  key: string;
  conceptId: number;
  title: string;
  why: string;
  tier: Tier;
  tierLabelText: string;
  score: number;
  /**
   * - mastered: the test was passed with enough score to count as mastered
   * - completed: the lesson was finished (timeline done or test passed) but
   *   mastery is still below the threshold
   * - current: where the learner is now — the one concept the car sits above
   * - upcoming: unlocked by its prerequisites, not started
   * - locked: prerequisites not met yet
   */
  status: "mastered" | "completed" | "current" | "upcoming" | "locked";
  slug: string;
};

type Props = {
  email: string;
  /** learner_name, falling back to the email local part. See lib/learner.ts. */
  displayName: string;
  background: string | null;
  goal: string;
  currentStreak: number;
  sparks: number;
  conceptsCompleted: number;
  totalConcepts: number;
  showFeedbackPrompt: boolean;
  /** Every 5 concepts the check-in gets a deeper form. */
  showDeepFeedbackPrompt: boolean;
  interests: string[];
  pathView: PathViewItem[];
  /** Data for the roadmap strip; computed alongside pathView on /me. */
  roadmap: RoadmapProps;
  /**
   * Concepts worth revisiting, computed by reviewCandidates on /me. Empty
   * while migration 013 is unapplied, which is why the card hides rather than
   * showing an empty session.
   */
  reviewCandidates: ReviewCandidate[];
  /** Certificate progress, using the same measure as the issue route. */
  certificate: {
    mastered: number;
    required: number;
    remaining: number;
    met: boolean;
    /** Issue date when one has been issued, else null. */
    issuedAt: string | null;
  };
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

function bucketComfort(title: string, why: string): "math" | "code" | "theory" | null {
  const hay = `${title} ${why}`.toLowerCase();
  const math = ["math", "calculus", "algebra", "probability", "statistics", "gradient", "derivative", "matrix"];
  const code = ["python", "code", "program", "syntax", "loop", "function", "variable", "data", "api", "debug", "list"];
  const theory = ["theory", "model", "neural", "network", "concept", "learning", "algorithm", "intelligence", "token"];
  if (math.some((k) => hay.includes(k))) return "math";
  if (code.some((k) => hay.includes(k))) return "code";
  if (theory.some((k) => hay.includes(k))) return "theory";
  return null;
}

type ComfortBar = {
  label: string;
  value: number; // 0-1
  count: number;
};

export default function Dashboard({
  email,
  displayName,
  background,
  goal,
  currentStreak,
  sparks,
  conceptsCompleted,
  totalConcepts,
  showFeedbackPrompt,
  showDeepFeedbackPrompt,
  interests,
  pathView,
  roadmap,
  reviewCandidates,
  certificate,
}: Props) {
  // The avatar follows the display name, not the email — a learner who typed
  // "Priya Sharma" should not be greeted by "p".
  const initial = (displayName ?? "L").charAt(0).toUpperCase();

  function AvatarGlyph() {
    return (
      <span className="font-heading text-sm font-bold">{initial}</span>
    );
  }

  const comfortBuckets: Record<"math" | "code" | "theory", number[]> = {
    math: [],
    code: [],
    theory: [],
  };
  for (const item of pathView) {
    const bucket = bucketComfort(item.title, item.why);
    if (bucket) comfortBuckets[bucket].push(item.score);
  }
  const comfort: ComfortBar[] = (["math", "code", "theory"] as const).map(
    (key) => ({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value:
        comfortBuckets[key].length > 0
          ? comfortBuckets[key].reduce((a, b) => a + b, 0) /
            comfortBuckets[key].length
          : 0,
      count: comfortBuckets[key].length,
    })
  );

  return (
    <div className="space-y-8">
      {/* Top strip */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard
          icon={Flame}
          value={`${currentStreak}d`}
          label="Day streak"
          color="var(--streak)"
        />
        <StatCard
          icon={Sparkles}
          value={sparks}
          label="Sparks earned"
          color="var(--sparks)"
        />
        <StatCard
          icon={AvatarGlyph}
          value={displayName}
          label="View profile"
          sublabel={email}
          color="var(--primary)"
          href="/me/profile"
        />
      </motion.div>

      {/* Welcome */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl">Welcome back, {displayName}</h1>
          <span className="chip bg-primary-soft text-primary">
            <Target size={12} />
            <span className="max-w-[12rem] truncate normal-case">{goal}</span>
          </span>
          {/* Background is still worth showing, just not as the greeting. */}
          {background && (
            <span className="chip bg-bgsubtle text-inkmuted">
              <Compass size={12} />
              <span className="max-w-[12rem] truncate normal-case">
                {background}
              </span>
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-inkmuted">
          {currentStreak > 0
            ? `You're on a ${currentStreak}-day streak — keep it going.`
            : "Pick up where you left off."}
        </p>
      </motion.div>

      {/* Certificate: only surfaced once it is within reach, so it reads as a
          milestone rather than one more thing on the page. */}
      {certificate.issuedAt ? (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <Link
            href="/me/certificate"
            className="card flex flex-wrap items-center justify-between gap-4"
            style={{ textDecoration: "none", borderColor: "var(--gold)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "var(--gold-soft)",
                  color: "var(--gold)",
                }}
              >
                <Award size={22} />
              </span>
              <div>
                <p className="font-heading text-lg leading-tight">
                  You&apos;ve earned your certificate!
                </p>
                <p className="text-sm text-inkmuted">
                  View it, download a PDF, or share it.
                </p>
              </div>
            </div>
            <span className="btn-primary shrink-0">View certificate →</span>
          </Link>
        </motion.div>
      ) : certificate.remaining > 0 && certificate.remaining <= 4 ? (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <p className="text-sm text-inkmuted">
            {certificate.remaining} more concept
            {certificate.remaining === 1 ? "" : "s"} to earn your certificate.{" "}
            <Link
              href="/me/certificate"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              style={{ textDecoration: "none" }}
            >
              See how close you are
            </Link>
            .
          </p>
        </motion.div>
      ) : null}

      {certificate.met && !certificate.issuedAt && (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <CertificateClaim
            mastered={certificate.mastered}
            required={certificate.required}
          />
        </motion.div>
      )}

      {(showDeepFeedbackPrompt || showFeedbackPrompt) && (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <FeedbackCard
            variant={showDeepFeedbackPrompt ? "deep" : "light"}
            conceptsCompleted={conceptsCompleted}
            learnerName={displayName}
          />
        </motion.div>
      )}

      {/* Review, above the roadmap: a nudge about the past is worth more before
          the learner reads what is ahead of them, and it is the one card that
          responds to something other than forward progress. */}
      {reviewCandidates.length > 0 && (
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
      )}

      {/* Roadmap summary */}
      {totalConcepts > 0 && <Roadmap {...roadmap} />}

      {/* Path timeline */}
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

      {/* What the AI knows about you */}
      <section>
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <h2 className="font-heading text-2xl">What the AI knows about you</h2>
          <p className="mt-1 text-sm text-inkmuted">
            From your onboarding and check-ins.
          </p>
        </motion.div>

        <div className="card mt-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkfaint">Background</p>
              <p className="mt-1 font-semibold">{background ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkfaint">Goal</p>
              <p className="mt-1 font-semibold">{goal}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {comfort.map((bar) => (
              <div key={bar.label}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">{bar.label} comfort</p>
                  <p className="font-heading text-lg font-bold text-primary">
                    {Math.round(bar.value * 100)}%
                  </p>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bgsubtle">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(bar.value * 100)}%` }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                  />
                </div>
                <p className="mt-1 text-xs text-inkfaint">
                  {bar.count === 0
                    ? "No concepts yet"
                    : `Across ${bar.count} concept${bar.count === 1 ? "" : "s"}`}
                </p>
              </div>
            ))}
          </div>

          {interests.length > 0 && (
            <div className="mt-6 border-t border-bgsubtle pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-inkfaint">
                Wants to go deeper on
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {interests.map((topic) => (
                  <span key={topic} className="chip bg-bgsubtle text-ink">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}