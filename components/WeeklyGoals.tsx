"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Check, Clock, Pencil, Target, X } from "lucide-react";
import { fireToast } from "@/components/Toast";
import { GOAL_BOUNDS } from "@/lib/learner";

export type WeeklyGoalProgress = {
  concepts: number;
  minutes: number;
};

type Props = {
  goalConcepts: number;
  goalMinutes: number;
  progress: WeeklyGoalProgress;
};

type Row = "concepts" | "minutes";

/** Bounds come from lib/learner; the PATCH route validates against the same. */
const BOUNDS: Record<Row, { min: number; max: number; step: number }> = {
  concepts: {
    ...GOAL_BOUNDS.weekly_goal_concepts,
    step: 1,
  },
  minutes: {
    ...GOAL_BOUNDS.weekly_goal_minutes,
    step: 10,
  },
};

const COPY = {
  concepts: {
    label: "Concepts this week",
    formLabel: "Concepts per week",
    rangeUnit: "concepts",
    icon: BookOpen,
  },
  minutes: {
    label: "Minutes this week",
    formLabel: "Minutes per week",
    rangeUnit: "minutes",
    icon: Clock,
  },
} as const;

export default function WeeklyGoals({
  goalConcepts,
  goalMinutes,
  progress,
}: Props) {
  const [concepts, setConcepts] = useState(goalConcepts);
  const [minutes, setMinutes] = useState(goalMinutes);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(row: Row) {
    setEditing(row);
    setError(null);
    setDraft(row === "concepts" ? concepts : minutes);
  }

  function cancelEdit() {
    setEditing(null);
    setError(null);
  }

  async function save(row: Row) {
    const { min, max, step } = BOUNDS[row];
    const value = Math.min(max, Math.max(min, draft));
    setDraft(value);
    setSaving(true);
    setError(null);

    try {
      const body =
        row === "concepts"
          ? { weekly_goal_concepts: value, weekly_goal_minutes: minutes }
          : { weekly_goal_concepts: concepts, weekly_goal_minutes: value };

      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }

      if (row === "concepts") setConcepts(value);
      else setMinutes(value);
      setEditing(null);
      fireToast("Weekly goal updated", "spark");
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card mt-10" aria-labelledby="weekly-goals-heading">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Target size={22} />
        </span>
        <div>
          <h2
            id="weekly-goals-heading"
            className="font-heading text-lg leading-tight"
          >
            Your weekly goals
          </h2>
          <p className="text-sm text-inkmuted">
            Rolling 7 days, ending today
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {(["concepts", "minutes"] as const).map((row) => {
          const goal = row === "concepts" ? concepts : minutes;
          const current = row === "concepts" ? progress.concepts : progress.minutes;
          const { label, formLabel, rangeUnit, icon: Icon } = COPY[row];
          const pct = Math.min(
            100,
            Math.round((current / Math.max(1, goal)) * 100)
          );
          const met = current >= goal;
          const isEditing = editing === row;

          return (
            <div key={row}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon size={15} className="text-inkmuted" />
                  {label}
                </p>
                <p className="text-sm text-inkmuted">
                  <span
                    className="font-heading text-base"
                    style={{ color: met ? "var(--success)" : undefined }}
                  >
                    {current}
                  </span>{" "}
                  of {goal}
                  {row === "minutes" ? " min" : ""}
                </p>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bgsubtle">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: met ? "var(--success)" : "var(--primary)" }}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 20 }}
                />
              </div>

              {isEditing ? (
                <div className="mt-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-inkmuted">
                      <span className="block">{formLabel}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={BOUNDS[row].min}
                        max={BOUNDS[row].max}
                        step={BOUNDS[row].step}
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(Number(e.target.value))}
                        className="mt-1 w-28 rounded-lg border border-bgsubtle bg-bgcard px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => save(row)}
                      disabled={saving}
                    >
                      <Check size={15} /> {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      <X size={15} /> Cancel
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-inkfaint">
                    {BOUNDS[row].min}–{BOUNDS[row].max} {rangeUnit}
                  </p>
                  {error && (
                    <p className="mt-1.5 text-xs" style={{ color: "var(--error)" }}>
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-secondary mt-3"
                  onClick={() => startEdit(row)}
                >
                  <Pencil size={14} /> Edit goal
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
