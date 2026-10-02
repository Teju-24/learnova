"use client";

import type { ElementType, ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Code2,
  Compass,
  Flame,
  Footprints,
  GraduationCap,
  Lock,
  Sparkles,
  Star,
  Trophy,
  Waves,
  Check,
  Zap,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import PrerequisiteGraph, {
  type PrerequisiteGraphProps,
} from "@/components/PrerequisiteGraph";
import { fadeInUp } from "@/lib/motion";

export type ProfileBadge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
};

export type DailyCell = {
  date: string;
  sparks: number;
};

export type SparkRow = {
  amount: number;
  reason: string;
  created_at: string;
};

type Props = {
  initial: string;
  name: string;
  /** Shown under the name as the account it belongs to. */
  email: string;
  goal: string;
  background: string | null;
  currentStreak: number;
  longestStreak: number;
  sparks: number;
  masteredCount: number;
  totalConcepts: number;
  last30: DailyCell[];
  activeDays: number;
  recentSparks: SparkRow[];
  badges: ProfileBadge[];
  /**
   * Renders the share card. The button owns its own canvas work, so this is a
   * plain presentational slot rather than more props threaded through.
   */
  shareSlot?: ReactNode;
  /**
   * The whole curriculum graph in one object rather than five more props: the
   * page assembles it from the concepts table and the learner row, and the
   * graph is optional so a profile still renders if that query fails.
   */
  graph?: PrerequisiteGraphProps;
};

const BADGE_ICONS: Record<string, ElementType> = {
  Footprints,
  Flame,
  Trophy,
  Code2,
  Star,
  GraduationCap,
  Waves,
  Compass,
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function cellColor(sparks: number): string {
  if (sparks <= 0) return "var(--bg-subtle)";
  if (sparks < 10) return "var(--success-soft)";
  if (sparks < 30) return "var(--success)";
  return "#0D9488";
}

export default function Profile({
  initial,
  name,
  email,
  goal,
  background,
  currentStreak,
  longestStreak,
  sparks,
  masteredCount,
  totalConcepts,
  last30,
  activeDays,
  recentSparks,
  badges,
  shareSlot,
  graph,
}: Props) {
  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const conceptsPct = Math.min(
    100,
    Math.round((masteredCount / Math.max(1, totalConcepts)) * 100)
  );

  return (
    <div className="space-y-10">
      {/* Header card */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card flex flex-col items-center text-center"
      >
        {/* Top-right of the header, but in flow rather than absolutely
            positioned: the avatar below is centred, so on a narrow phone an
            absolute button would sit on top of it. */}
        {shareSlot && <div className="mb-1 self-end">{shareSlot}</div>}
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary font-heading text-3xl font-bold text-white">
          {initial}
        </span>
        <h1 className="mt-3 font-heading text-2xl">{name}</h1>
        {email && <p className="mt-1 text-sm text-inkmuted">{email}</p>}
        <p className="mt-1 text-sm text-inkmuted">
          Goal: <span className="font-semibold">{goal}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {background && (
            <span className="chip bg-bgsubtle text-ink">{background}</span>
          )}
          <span className="chip bg-success-soft text-success">
            <Zap size={12} /> Active learner
          </span>
        </div>
      </motion.section>

      {/* Stats */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatCard
          icon={Flame}
          value={currentStreak}
          label="Day streak"
          sublabel={`Longest: ${longestStreak}`}
          color="var(--streak)"
        />
        <StatCard
          icon={Sparkles}
          value={sparks}
          label="Sparks earned"
          sublabel="Across lessons and tests"
          color="var(--sparks)"
        />
        <motion.div variants={fadeInUp}>
          <div className="card flex h-full items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bgsubtle text-inkmuted">
              <Code2 size={20} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-2xl leading-none">
                {masteredCount} <span className="text-base text-inkmuted">of {totalConcepts}</span>
              </span>
              <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-inkmuted">
                Concepts mastered
              </span>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bgsubtle">
                <motion.div
                  className="h-full rounded-full bg-success"
                  initial={{ width: 0 }}
                  animate={{ width: `${conceptsPct}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 20 }}
                />
              </div>
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* Achievements */}
      <section>
        <div className="flex items-baseline justify-between">
          <motion.div variants={fadeInUp} initial="initial" animate="animate">
            <h2 className="font-heading text-2xl">Achievements</h2>
            <p className="mt-1 text-sm text-inkmuted">
              Every badge tells a story.
            </p>
          </motion.div>
          <span className="status-pill bg-gold-soft text-gold">
            {unlockedCount} of {badges.length} unlocked
          </span>
        </div>

        <motion.div
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        >
          {badges.map((badge) => {
            const Icon = BADGE_ICONS[badge.icon] ?? Trophy;
            return (
              <motion.div
                key={badge.id}
                variants={fadeInUp}
                className={`card relative flex flex-col items-center text-center ${badge.unlocked ? "" : "opacity-40"}`}
                style={
                  badge.unlocked
                    ? { borderColor: "rgba(245,158,11,0.4)" }
                    : undefined
                }
              >
                <span
                  className={`relative flex h-14 w-14 items-center justify-center rounded-full ${
                    badge.unlocked
                      ? "bg-gold-soft text-gold"
                      : "bg-bgsubtle text-inkfaint"
                  }`}
                >
                  <Icon size={24} strokeWidth={1.8} />
                  {badge.unlocked && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success ring-2 ring-bgcard">
                      <Check size={11} className="text-white" strokeWidth={3.5} />
                    </span>
                  )}
                </span>
                <p className="mt-2 text-sm font-semibold">{badge.name}</p>
                <p className="mt-0.5 text-xs text-inkmuted">{badge.description}</p>
                {badge.unlocked && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-success">
                    Unlocked
                  </p>
                )}
                {!badge.unlocked && (
                  <span className="absolute right-2 top-2 text-inkfaint">
                    <Lock size={14} />
                  </span>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* Curriculum graph */}
      {graph && graph.concepts.length > 0 && (
        <section>
          <motion.div variants={fadeInUp} initial="initial" animate="animate">
            <h2 className="font-heading text-2xl">Your curriculum graph</h2>
            <p className="mt-1 text-sm text-inkmuted">
              {graph.concepts.length} concepts, centred by difficulty. Lines show
              which concepts must come first.
            </p>
          </motion.div>

          <div className="card mt-4">
            <PrerequisiteGraph {...graph} />
          </div>
        </section>
      )}

      {/* Activity heatmap */}
      <section>
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <h2 className="font-heading text-2xl">Activity</h2>
          <p className="mt-1 text-sm text-inkmuted">
            Your last 30 days of learning.
          </p>
        </motion.div>
        <motion.div
          className="mt-4 grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {last30.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.sparks} sparks`}
              className="aspect-square rounded-sm"
              style={{ backgroundColor: cellColor(d.sparks) }}
            />
          ))}
        </motion.div>
        <motion.p
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          className="mt-2 flex items-center gap-1.5 text-sm text-inkmuted"
        >
          <Flame size={14} className="text-streak" />
          {activeDays} active day{activeDays === 1 ? "" : "s"} in the last 30
        </motion.p>
      </section>

      {/* Recent Sparks */}
      <section>
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <h2 className="font-heading text-2xl">Recent Sparks</h2>
          <p className="mt-1 text-sm text-inkmuted">
            Every practice earns you a bit of spark.
          </p>
        </motion.div>

        {recentSparks.length === 0 ? (
          <p className="mt-3 text-sm text-inkmuted">
            No sparks earned yet. Start a lesson!
          </p>
        ) : (
          <motion.ul
            className="mt-4 flex flex-col gap-2"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          >
            {recentSparks.map((row, i) => (
              <motion.li
                key={`${row.created_at}-${i}`}
                variants={fadeInUp}
                className="flex items-center gap-3 rounded-lg border border-bgsubtle bg-bgcard px-4 py-3 text-sm"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sparks"
                  style={{ backgroundColor: "rgba(139,92,246,0.14)", color: "var(--sparks)" }}
                >
                  <Sparkles size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate">{row.reason}</span>
                <span className="shrink-0 font-semibold text-success">
                  +{row.amount}
                </span>
                <span className="shrink-0 text-xs text-inkfaint">
                  {relativeTime(row.created_at)}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>
    </div>
  );
}