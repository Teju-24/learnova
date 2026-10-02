import { MASTERED_AT } from "@/lib/tier";

/** The curriculum ships 20 concepts; see scripts/seed-curriculum.ts. */
export const TOTAL_CONCEPTS = 20;

/**
 * Concepts needed to earn the certificate: 80% of the curriculum. Spelled as a
 * fraction of TOTAL_CONCEPTS rather than the literal 16 so a future curriculum
 * change moves the bar instead of silently leaving a stale hard-coded number in
 * the database and on the page.
 */
export const CERTIFICATE_AT = 16;

/**
 * What to call the learner. `learner_name` is optional and is null for anyone
 * who skipped the onboarding step or typed only whitespace, so the email local
 * part is the fallback everywhere a name is shown.
 *
 * Returns a usable string even with no email (OAuth accounts can have none) so
 * callers never have to guard the result.
 */
export function displayName(
  learnerName: string | null | undefined,
  email: string | null | undefined
): string {
  const typed = learnerName?.trim();
  if (typed) return typed;

  const local = (email ?? "").split("@")[0]?.trim();
  return local || "Learner";
}

/** First letter for avatars: from the display name, never from the raw email. */
export function initialFor(name: string): string {
  return name.charAt(0).toUpperCase() || "L";
}

/**
 * How many concepts count toward the certificate. Deliberately the same
 * measure as countMasteredConcepts so the dashboard, the issue route and the
 * certificate page cannot disagree about whether the bar is met.
 */
export function certificateProgress(
  mastery: Record<string, number> | null | undefined
): { mastered: number; required: number; remaining: number; met: boolean } {
  const mastered = Object.values(mastery ?? {}).reduce(
    (total, score) =>
      typeof score === "number" && score >= MASTERED_AT ? total + 1 : total,
    0
  );
  return {
    mastered,
    required: CERTIFICATE_AT,
    remaining: Math.max(0, CERTIFICATE_AT - mastered),
    met: mastered >= CERTIFICATE_AT,
  };
}

// —— Weekly goals (migration 012) ——

export const DEFAULT_GOAL_CONCEPTS = 2;
export const DEFAULT_GOAL_MINUTES = 30;

/**
 * Inclusive bounds for the two goals. Shared so the number inputs, the client
 * clamp and the PATCH validator cannot drift apart: the UI must not offer a
 * value the route would reject.
 */
export const GOAL_BOUNDS = {
  weekly_goal_concepts: { min: 1, max: 10 },
  weekly_goal_minutes: { min: 10, max: 300 },
} as const;

/** The window is a rolling 7 days, not a calendar week, so nothing resets. */
export const WEEKLY_GOAL_WINDOW_DAYS = 7;

/**
 * Nothing in the schema records how long a learner spent. `daily_activity`
 * counts what they *did* — sections read and interactions completed — so
 * minutes have to be estimated from those counts.
 *
 * The unit costs below are deliberately round and are shown in the UI as an
 * estimate rather than as measured time. If real timing is ever recorded, these
 * should be replaced by it and the wording dropped.
 */
const MINUTES_PER_SECTION_READ = 1;
const MINUTES_PER_INTERACTION = 1.5;

export type DailyActivityForGoals = {
  date: string;
  read_lessons: number | null;
  interactions_completed: number | null;
};

/** `YYYY-MM-DD` for a Date, in UTC to match how daily_activity.date is stored. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Concepts finished inside the window. `concept_completed_at` is a map keyed
 * `${conceptId}:${tier}`, so a learner who worked the beginner and intermediate
 * tiers of the same concept this week holds two entries for one concept.
 * Counting entries would credit that twice, so the concept id is de-duplicated.
 */
export function conceptsCompletedThisWeek(
  conceptCompletedAt: Record<string, unknown> | null | undefined,
  now: Date = new Date()
): number {
  const entries = Object.entries(conceptCompletedAt ?? {});
  if (entries.length === 0) return 0;

  const cutoff = now.getTime() - WEEKLY_GOAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const conceptKeys = new Set<string>();

  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    const at = Date.parse(value);
    if (Number.isNaN(at) || at < cutoff) continue;
    // Unparseable keys still count once each, just under their own key.
    const conceptId = Number.parseInt(key.split(":")[0] ?? "", 10);
    conceptKeys.add(Number.isNaN(conceptId) ? key : String(conceptId));
  }

  return conceptKeys.size;
}

/** Estimated minutes studied inside the window, from daily_activity counters. */
export function minutesThisWeek(
  rows: DailyActivityForGoals[] | null | undefined,
  now: Date = new Date()
): number {
  if (!rows || rows.length === 0) return 0;

  // Compare on calendar days: `date` has no time component, so a timestamp
  // comparison would drop the learner's activity for today.
  const windowStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (WEEKLY_GOAL_WINDOW_DAYS - 1)
    )
  );
  const startDay = isoDay(windowStart);

  let total = 0;
  for (const row of rows) {
    if (row.date < startDay) continue;
    total +=
      (row.read_lessons ?? 0) * MINUTES_PER_SECTION_READ +
      (row.interactions_completed ?? 0) * MINUTES_PER_INTERACTION;
  }

  return Math.round(total);
}

// —— Curriculum status (used by /glossary) ——

/** Progress and completion are stored per (concept, tier). */
export const CONTENT_TIERS = ["beginner", "intermediate", "advanced"] as const;

export type ConceptStatus =
  | "mastered"
  | "completed"
  | "in_progress"
  | "locked"
  | "new";

export type ConceptStatusInput = {
  conceptId: number;
  /** Mastery is keyed by slug, not id. */
  slug: string | null | undefined;
  prerequisites: number[] | null | undefined;
  mastery: Record<string, number> | null | undefined;
  completionMap: Record<string, unknown> | null | undefined;
  lessonProgress:
    | Record<string, { last_step?: unknown; completed_at?: unknown }>
    | null
    | undefined;
  /** id -> slug, needed because mastery is keyed by slug. */
  slugById: Map<number, string>;
};

function masteryOf(
  conceptId: number,
  mastery: Record<string, number> | null | undefined,
  slugById: Map<number, string>
): number {
  const slug = slugById.get(conceptId);
  return slug ? (mastery?.[slug] ?? 0) : 0;
}

/**
 * A concept is playable once every prerequisite is mastered. No prerequisites
 * means always open. A prerequisite we cannot resolve to a slug counts as not
 * mastered, so an unresolvable graph locks rather than silently opening.
 *
 * Same rule as the dashboard's isUnlocked, deliberately without the dashboard's
 * "within two positions of the current concept" window: the glossary is a map
 * of the whole curriculum, and hiding half of it behind an ordering heuristic
 * would make the page disagree with the graph it is describing.
 */
export function isConceptUnlocked(
  prerequisites: number[] | null | undefined,
  mastery: Record<string, number> | null | undefined,
  slugById: Map<number, string>
): boolean {
  const list = Array.isArray(prerequisites) ? prerequisites : [];
  if (list.length === 0) return true;
  return list.every((id) => masteryOf(id, mastery, slugById) >= MASTERED_AT);
}

/**
 * Status for one concept, in precedence order. Mirrors the dashboard's
 * mastered/completed tests so a concept can never read as MASTERED on the
 * glossary and IN PROGRESS on the dashboard.
 */
export function conceptStatus(input: ConceptStatusInput): ConceptStatus {
  const {
    conceptId,
    slug,
    prerequisites,
    mastery,
    completionMap,
    lessonProgress,
    slugById,
  } = input;

  const score = slug ? (mastery?.[slug] ?? 0) : 0;
  if (score >= MASTERED_AT) return "mastered";

  // Finished means the timeline reached its last step with an activity
  // answered, or the test was passed - recorded on whichever tier was played.
  const finished = CONTENT_TIERS.some((tier) => {
    const key = `${conceptId}:${tier}`;
    if (typeof completionMap?.[key] === "string") return true;
    // Learners who finished before concept_completed_at existed only have the
    // lesson_progress stamp, so fall back to it.
    return typeof lessonProgress?.[key]?.completed_at === "string";
  });
  if (finished) return "completed";

  // Started: any tier has a recorded step beyond the first.
  const started = CONTENT_TIERS.some((tier) => {
    const entry = lessonProgress?.[`${conceptId}:${tier}`];
    if (!entry) return false;
    const step = typeof entry.last_step === "number" ? entry.last_step : 0;
    return step > 0;
  });
  if (started) return "in_progress";

  if (!isConceptUnlocked(prerequisites, mastery, slugById)) return "locked";
  return "new";
}

// —— Review mode (migration 013) ——
//
// A concept earns a place in a review session when it is either weak AND
// forgotten, or when a test sitting went badly and has not been retried. Both
// rules need the same two facts — how strong the learner is, and when they
// last saw it — so they are computed together and the dashboard and the review
// page read one function.

/** Partial mastery: weak enough to be worth revisiting, not yet mastered. */
export const REVIEW_MIN_MASTERY = 0.4;
/** At the mastery threshold, i.e. no longer "partial". Matches MASTERED_AT. */
export const REVIEW_MAX_MASTERY = 0.7;
/** A weak concept is only surfaced once it has been untouched this long. */
export const REVIEW_STALE_DAYS = 5;
/** After failing a test, this long before the concept is worth raising again. */
export const REVIEW_RETAKE_DAYS = 3;
/** One question per candidate, so a session is three questions, not a lecture. */
export const REVIEW_SESSION_SIZE = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewReason = "stale-partial" | "failed-test";

export type ReviewCandidate = {
  conceptId: number;
  title: string;
  slug: string;
  tier: string;
  /** The learner's mastery for this concept. */
  score: number;
  reason: ReviewReason;
  /** Null when the concept has no recorded touch at all. */
  lastSeen: string | null;
  daysSinceSeen: number | null;
  /** Most recent test sitting for this concept, if any. */
  lastAttemptAt: string | null;
  lastAttemptPassed: boolean | null;
};

export type TestAttemptForReview = {
  concept_id: number;
  passed: boolean;
  created_at: string;
};

export type ReviewInput = {
  /** The learner's path, in order. Review only ever draws from the path. */
  pathItems: { concept_id: number; tier: string }[];
  /** id -> slug/title, resolved by the caller. Mastery is keyed by slug. */
  slugById: Map<number, string>;
  titleById: Map<number, string>;
  mastery: Record<string, number> | null | undefined;
  /** concept_id -> last_seen, from learner_concepts. */
  lastSeenByConcept: Map<number, string>;
  attempts: TestAttemptForReview[] | null | undefined;
  now?: Date;
  limit?: number;
};

/** Whole days between an ISO timestamp and now, or null if unusable. */
function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (typeof iso !== "string") return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.floor((now.getTime() - at) / DAY_MS);
}

/**
 * Collapse the attempt history to the latest sitting per concept. A concept is
 * only a "failed test" candidate if its MOST RECENT attempt failed — a learner
 * who failed and has since passed is up to date, and the recency test on the
 * latest attempt already handles that. Keeping every attempt would let an old
 * failure resurrect a concept the learner has since aced.
 */
function latestAttemptByConcept(
  attempts: TestAttemptForReview[] | null | undefined
): Map<number, TestAttemptForReview> {
  const latest = new Map<number, TestAttemptForReview>();
  for (const attempt of attempts ?? []) {
    if (typeof attempt?.concept_id !== "number") continue;
    if (typeof attempt.passed !== "boolean") continue;
    const at = Date.parse(attempt.created_at);
    if (Number.isNaN(at)) continue;
    const held = latest.get(attempt.concept_id);
    if (!held || Date.parse(held.created_at) < at) {
      latest.set(attempt.concept_id, attempt);
    }
  }
  return latest;
}

/**
 * The concepts to review, most overdue first.
 *
 * Two independent rules, either is enough:
 *
 *  1. Partial mastery (REVIEW_MIN_MASTERY..REVIEW_MAX_MASTERY) that has gone
 *     untouched for more than REVIEW_STALE_DAYS days. Half-learnt and fading.
 *  2. The latest test sitting failed and was more than REVIEW_RETAKE_DAYS days
 *     ago. A wrong answer the learner has not had another go at.
 *
 * Boundaries: the mastery range is inclusive at both ends, the stale rule is
 * strict ("more than 5 days"), and the retake rule is inclusive ("hasn't
 * retaken it in 3 days" = at least 3 days have passed). A concept with no
 * last_seen cannot satisfy rule 1 — there is no evidence it was ever seen, so
 * treating "no data" as "infinitely stale" would review the whole curriculum.
 *
 * A concept with no last_seen can still qualify under rule 2, because failing
 * a test is itself evidence of having seen it.
 *
 * Ordered by how long the learner has been away from it, then weakest first, so
 * the three that surface are the three most overdue. Review is a nudge, not a
 * backlog: the limit is what keeps it from turning into a list of shame.
 */
export function reviewCandidates(input: ReviewInput): ReviewCandidate[] {
  const {
    pathItems,
    slugById,
    titleById,
    mastery,
    lastSeenByConcept,
    attempts,
    now = new Date(),
    limit = REVIEW_SESSION_SIZE,
  } = input;

  const latestAttempt = latestAttemptByConcept(attempts);
  const found: ReviewCandidate[] = [];

  for (const item of pathItems) {
    if (typeof item?.concept_id !== "number") continue;

    const slug = slugById.get(item.concept_id);
    // A path entry we cannot resolve to a slug has no mastery to judge, so it
    // is skipped rather than guessed at.
    if (!slug) continue;

    const score = mastery?.[slug] ?? 0;
    const lastSeen = lastSeenByConcept.get(item.concept_id) ?? null;
    const daysSeen = daysSince(lastSeen, now);

    const attempt = latestAttempt.get(item.concept_id) ?? null;
    const attemptDays = daysSince(attempt?.created_at ?? null, now);

    const partial =
      score >= REVIEW_MIN_MASTERY && score <= REVIEW_MAX_MASTERY;
    const stale = daysSeen !== null && daysSeen > REVIEW_STALE_DAYS;
    const failedRecentlyEnoughToMatter =
      attempt !== null && !attempt.passed && attemptDays !== null
        ? attemptDays >= REVIEW_RETAKE_DAYS
        : false;

    if (partial && stale) {
      found.push({
        conceptId: item.concept_id,
        title: titleById.get(item.concept_id) ?? `Concept #${item.concept_id}`,
        slug,
        tier: item.tier,
        score,
        reason: "stale-partial",
        lastSeen,
        daysSinceSeen: daysSeen,
        lastAttemptAt: attempt?.created_at ?? null,
        lastAttemptPassed: attempt?.passed ?? null,
      });
      continue;
    }

    if (failedRecentlyEnoughToMatter) {
      found.push({
        conceptId: item.concept_id,
        title: titleById.get(item.concept_id) ?? `Concept #${item.concept_id}`,
        slug,
        tier: item.tier,
        score,
        reason: "failed-test",
        lastSeen,
        daysSinceSeen: daysSeen,
        lastAttemptAt: attempt?.created_at ?? null,
        lastAttemptPassed: false,
      });
    }
  }

  found.sort((a, b) => {
    // No last_seen sorts last rather than first: unknown age is not "very old".
    const daysA = a.daysSinceSeen ?? -1;
    const daysB = b.daysSinceSeen ?? -1;
    if (daysA !== daysB) return daysB - daysA;
    return a.score - b.score;
  });

  return found.slice(0, limit);
}

