"use client";

import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import type { PathViewItem } from "@/lib/dashboard-types";

type Props = {
  background: string | null;
  goal: string;
  interests: string[];
  /** Used to derive the three comfort bars, exactly as the old dashboard did. */
  pathView: PathViewItem[];
};

type ComfortBar = {
  label: string;
  value: number; // 0-1
  count: number;
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

/** The "What the AI knows about you" card: background, goal, comfort, interests. */
export default function DashboardProfile({
  background,
  goal,
  interests,
  pathView,
}: Props) {
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
  );
}
