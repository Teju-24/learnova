import type { SupabaseClient } from "@supabase/supabase-js";

export const SPARKS = {
  READ_SECTION: 2,
  CORRECT_INTERACTION: 5,
  PARTIAL_INTERACTION: 1,
  COMPLETE_LESSON: 20,
  PASS_TEST: 50,
  PERFECT_TEST_BONUS: 30,
  DAILY_FIRST_ACTIVITY: 10,
};

export const MASTERY = {
  /** Awarded for a correct answer, where the score is at or above this. */
  CORRECT_THRESHOLD: 0.8,
  /** Added to mastery by a correct answer. */
  CORRECT_DELTA: 0.08,
  /** Added by a wrong or partial answer. */
  INCORRECT_DELTA: 0.02,
  /** Floor a passing test sets, so passing can never lower mastery. */
  PASS_FLOOR: 0.75,
} as const;

/**
 * Mastery after one graded attempt.
 *
 * Deliberately monotonic: mastery only ever rises. A learner who rereads or
 * retries cannot lose ground, so the ring never appears to fluctuate. Reading
 * a section must not call this at all — progress through the material is
 * tracked separately by lesson_progress.
 */
export function nextMastery(old: number, score: number): number {
  const delta =
    score >= MASTERY.CORRECT_THRESHOLD
      ? MASTERY.CORRECT_DELTA
      : MASTERY.INCORRECT_DELTA;
  return clampMastery(old + delta);
}

/**
 * Round on the way in, not just clamp.
 *
 * Repeatedly adding 0.08 and 0.02 in binary floating point drifts: a learner
 * who has earned exactly 0.4 can end up stored as 0.39999999999999997, which
 * then fails the `mastery >= 0.4` test in masteryToTier and gets routed to the
 * beginner tier. Four decimals is far finer than the display needs and keeps
 * tier boundaries exact.
 */
export function clampMastery(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 10000) / 10000;
}

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name (rendered as emoji fallback)
};

export const BADGES: BadgeDef[] = [
  {
    id: "first_steps",
    name: "First Steps",
    icon: "Footprints",
    description: "Complete your first lesson",
  },
  {
    id: "week_one",
    name: "Week One",
    icon: "Flame",
    description: "7-day streak",
  },
  {
    id: "month_master",
    name: "Month Master",
    icon: "Trophy",
    description: "30-day streak",
  },
  {
    id: "pythonista",
    name: "Pythonista",
    icon: "Code2",
    description: "Complete 3 Python-related concepts",
  },
  {
    id: "perfect",
    name: "Perfect",
    icon: "Star",
    description: "Score 100% on any test",
  },
  {
    id: "scholar",
    name: "Scholar",
    icon: "GraduationCap",
    description: "Earn 500 Sparks",
  },
  {
    id: "deep_diver",
    name: "Deep Diver",
    icon: "Waves",
    description: "Complete an intermediate-tier lesson",
  },
  {
    id: "explorer",
    name: "Explorer",
    icon: "Compass",
    description: "Open 10 different concepts",
  },
];

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / 86400000);
}

export type ActivityKind =
  | { kind: "read_section" }
  | { kind: "interaction"; score: number }
  | { kind: "lesson_complete"; conceptId: number; tier: string }
  | { kind: "test_pass"; score: number }
  | { kind: "concept_open"; conceptId: number };

/**
 * Move this learner's `last_seen` for a concept forward — the write half of
 * review mode (migration 013). Called by every route that means "the learner is
 * on this concept right now": opening it, working through it, sitting its test,
 * or answering a review question.
 *
 * Fire-and-forget by design. A missing touch only makes a concept look older
 * than it is, so it must never fail the request that triggered it, and it must
 * not start failing loudly while migration 013 is still unapplied — which is the
 * same "optional, degrade quietly" treatment 006-012 get.
 */
export async function touchConceptSeen(
  supabase: SupabaseClient,
  conceptId: number
): Promise<void> {
  if (!Number.isInteger(conceptId) || conceptId <= 0) return;

  const { error } = await supabase.rpc("touch_concept_seen", {
    p_concept_id: conceptId,
  });

  if (error) {
    console.warn(
      "[gamification] touch_concept_seen failed (migration 013 pending?):",
      error.message
    );
  }
}

export type ActivityOptions = {
  /**
   * Record the interaction without paying out Sparks. Used for repeat
   * attempts at something the learner has already earned Sparks for:
   * the activity still counts towards `daily_activity`, still maintains
   * the daily streak, and still unlocks badges that are not gated on a
   * Sparks threshold, but no Sparks are added and no `sparks_log` row is
   * written.
   */
  skipSparks?: boolean;
};

export async function recordActivity(
  supabase: SupabaseClient,
  userId: string,
  activity: ActivityKind,
  options?: ActivityOptions
): Promise<{
  sparks: number;
  currentStreak: number;
  longestStreak: number;
  newBadges: BadgeDef[];
  totalSparks: number;
}> {
  const { data: learner } = await supabase
    .from("learners")
    .select(
      "sparks, current_streak, longest_streak, last_active_date, last_read_date, last_activity_date, badges, mastery"
    )
    .eq("user_id", userId)
    .single();

  if (!learner) throw new Error("learner not found");

  const today = todayISO();
  const skipSparks = options?.skipSparks === true;

  let sparksDelta = 0;
  let reason = "";
  let readIncrement = 0;
  let interactionIncrement = 0;

  switch (activity.kind) {
    case "read_section":
      sparksDelta = SPARKS.READ_SECTION;
      reason = "Read a section";
      readIncrement = 1;
      break;
    case "interaction":
      sparksDelta =
        activity.score >= 0.8
          ? SPARKS.CORRECT_INTERACTION
          : SPARKS.PARTIAL_INTERACTION;
      reason =
        activity.score >= 0.8 ? "Correct interaction" : "Interaction attempt";
      interactionIncrement = 1;
      break;
    case "lesson_complete":
      sparksDelta = SPARKS.COMPLETE_LESSON;
      reason = "Completed a lesson";
      break;
    case "test_pass":
      sparksDelta =
        SPARKS.PASS_TEST +
        (activity.score === 1 ? SPARKS.PERFECT_TEST_BONUS : 0);
      reason =
        activity.score === 1 ? "Perfect test score" : "Passed a test";
      break;
    case "concept_open":
      break;
  }

  if (skipSparks) {
    sparksDelta = 0;
  }

  const lastActive = learner.last_active_date as string | null;
  const isNewDay = lastActive !== today;
  if (!skipSparks && isNewDay && activity.kind !== "concept_open") {
    sparksDelta += SPARKS.DAILY_FIRST_ACTIVITY;
    reason += " (+daily bonus)";
  }

  let currentStreak = (learner.current_streak as number) ?? 0;
  let longestStreak = (learner.longest_streak as number) ?? 0;
  if (isNewDay) {
    if (lastActive && daysBetween(lastActive, today) === 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  await supabase.rpc("increment_daily_activity", {
    p_user_id: userId,
    p_date: today,
    p_read: readIncrement,
    p_interactions: interactionIncrement,
    p_sparks: sparksDelta,
  });

  const newSparks = ((learner.sparks as number) ?? 0) + sparksDelta;
  const update: Record<string, unknown> = {
    sparks: newSparks,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    last_active_date: today,
  };
  if (readIncrement > 0) update.last_read_date = today;
  if (interactionIncrement > 0) update.last_activity_date = today;

  const currentBadges: string[] = Array.isArray(learner.badges)
    ? [...(learner.badges as string[])]
    : [];
  const newBadges: BadgeDef[] = [];

  const unlock = (id: string) => {
    if (!currentBadges.includes(id)) {
      currentBadges.push(id);
      const def = BADGES.find((b) => b.id === id);
      if (def) newBadges.push(def);
    }
  };

  if (activity.kind === "lesson_complete") unlock("first_steps");
  if (currentStreak >= 7) unlock("week_one");
  if (currentStreak >= 30) unlock("month_master");
  if (activity.kind === "test_pass" && activity.score === 1) unlock("perfect");
  if (!skipSparks && newSparks >= 500) unlock("scholar");
  if (
    activity.kind === "lesson_complete" &&
    activity.tier === "intermediate"
  ) {
    unlock("deep_diver");
  }

  const mastery = (learner.mastery ?? {}) as Record<string, number>;
  const pyCount = Object.entries(mastery).filter(
    ([slug, m]) => slug.startsWith("python") && m >= 0.7
  ).length;
  if (pyCount >= 3) unlock("pythonista");

  if (activity.kind === "concept_open") {
    const { count } = await supabase
      .from("concept_open_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= 10) unlock("explorer");
  }

  update.badges = currentBadges;

  await supabase.from("learners").update(update).eq("user_id", userId);

  if (sparksDelta > 0) {
    await supabase.from("sparks_log").insert({
      user_id: userId,
      amount: sparksDelta,
      reason,
    });
  }

  if (activity.kind === "concept_open") {
    await supabase.from("concept_open_log").upsert(
      { user_id: userId, concept_id: activity.conceptId },
      { onConflict: "user_id,concept_id", ignoreDuplicates: true }
    );
  }

  return {
    sparks: sparksDelta,
    currentStreak,
    longestStreak,
    newBadges,
    totalSparks: newSparks,
  };
}
