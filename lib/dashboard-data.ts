import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MASTERED_AT, resolveTier, tierLabel } from "@/lib/tier";
import { reviewCandidates, type ReviewCandidate } from "@/lib/learner";
import type { RoadmapProps } from "@/components/Roadmap";
import type { PathViewItem } from "@/lib/dashboard-types";

/**
 * Server-only data layer for the dashboard. Every loader is wrapped in React's
 * `cache`, so when the Suspense-streamed sections on /me ask for the same data
 * they share one in-flight promise and one round trip per request. The static
 * curriculum graph is additionally cached across requests with
 * `unstable_cache` (concepts has a public-read RLS policy, so an anon client is
 * enough) — the dashboard no longer pays a concepts query on every visit, and
 * prerequisite ids can be resolved from memory instead of a second query.
 *
 * IMPORTANT: this module reads cookies and must only be imported by Server
 * Components.
 */

export type PathItem = {
  concept_id: number;
  tier: string;
  why: string;
};

export type LearnerRow = {
  user_id: string;
  goal: string | null;
  background: string | null;
  /** Arrives with migration 009; null for anyone who skipped the name step. */
  learner_name: string | null;
  mastery: Record<string, number> | null;
  path: PathItem[];
  current_concept: number | null;
  current_streak: number | null;
  sparks: number | null;
  show_feedback_prompt: boolean | null;
  show_deep_feedback_prompt: boolean | null;
  lesson_progress: Record<string, LessonProgressEntry> | null;
  concept_completed_at: Record<string, unknown> | null;
};

export type ConceptRow = {
  id: number;
  slug: string;
  title: string;
  /** Prerequisite concept IDs — mastery is keyed by slug, so these are mapped. */
  prerequisites: number[] | null;
};

type LessonProgressEntry = {
  last_step?: unknown;
  completed_at?: unknown;
};

type FeedbackRow = {
  interests: string | null;
};

/**
 * One supabase client per request. `createClient` reads cookies, so caching the
 * call (rather than the value) keeps the per-request session without building a
 * new client in every loader.
 */
const getSupabase = cache(async () => createClient());

export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The whole curriculum graph, cached across requests. `concepts` is public
 * read, so an anon client (no cookies) is sufficient and keeps this fetch
 * cacheable. The graph is seeded from scripts/seed-curriculum.ts and changes
 * only when the curriculum does, hence the hour-long revalidate.
 */
const loadAllConcepts = unstable_cache(
  async (): Promise<ConceptRow[]> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return [];
    const client = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client
      .from("concepts")
      .select("id, slug, title, prerequisites")
      .returns<ConceptRow[]>();
    if (error) {
      console.warn("[dashboard] concepts fetch failed:", error.message);
      return [];
    }
    return data ?? [];
  },
  ["dashboard-all-concepts"],
  { revalidate: 3600, tags: ["concepts"] }
);

export const loadLearner = cache(
  async (userId: string): Promise<LearnerRow | null> => {
    const supabase = await getSupabase();

    // The feedback flags arrive with migrations 006/007 and concept_completed_at
    // with 008. If those columns are not there yet the select fails outright,
    // which would bounce the learner back to /start, so the dashboard falls back
    // to the column list it always had.
    const BASE_COLUMNS =
      "user_id, goal, background, mastery, path, current_concept, current_streak, sparks";
    const OPTIONAL_COLUMNS =
      ", learner_name, show_feedback_prompt, show_deep_feedback_prompt, lesson_progress, concept_completed_at";

    const { data, error } = await supabase
      .from("learners")
      .select(`${BASE_COLUMNS}${OPTIONAL_COLUMNS}`)
      .eq("user_id", userId)
      .limit(1)
      .returns<LearnerRow[]>();

    if (error) {
      // Expected while any of 006-009 is pending, not a real failure.
      console.warn("[me] optional learner columns unavailable:", error.message);
      const retry = await supabase
        .from("learners")
        .select(BASE_COLUMNS)
        .eq("user_id", userId)
        .limit(1)
        .returns<LearnerRow[]>();
      return retry.data?.[0] ?? null;
    }
    return data?.[0] ?? null;
  }
);

export type ConceptMaps = {
  conceptById: Map<number, ConceptRow>;
  slugById: Map<number, string>;
  titleById: Map<number, string>;
};

/**
 * Concepts on this learner's path, plus every prerequisite id resolved from the
 * full graph. Prerequisites may sit outside the path, which is why the whole
 * graph is loaded; mastery is keyed by slug, so the maps are keyed by id.
 */
export const loadConcepts = cache(async (userId: string): Promise<ConceptMaps> => {
  const learner = await loadLearner(userId);
  const pathItems: PathItem[] = Array.isArray(learner?.path) ? learner.path : [];
  const pathConceptIds = new Set(pathItems.map((p) => p.concept_id));

  const all = await loadAllConcepts();
  const conceptById = new Map<number, ConceptRow>();
  const slugById = new Map<number, string>();
  const titleById = new Map<number, string>();

  for (const concept of all) {
    slugById.set(concept.id, concept.slug);
    titleById.set(concept.id, concept.title);
    if (pathConceptIds.has(concept.id)) conceptById.set(concept.id, concept);
  }

  return { conceptById, slugById, titleById };
});

export type PathViewData = {
  pathView: PathViewItem[];
  totalConcepts: number;
  roadmap: RoadmapProps;
  completedIds: number[];
  masteredIds: number[];
  lockedIds: number[];
};

const TIERS = ["beginner", "intermediate", "advanced"] as const;

export const loadPathView = cache(async (userId: string): Promise<PathViewData> => {
  const learner = await loadLearner(userId);
  const empty: PathViewData = {
    pathView: [],
    totalConcepts: 0,
    roadmap: {
      path: [],
      completedIds: [],
      masteredIds: [],
      lockedIds: [],
      carConceptId: null,
      conceptTitles: {},
    },
    completedIds: [],
    masteredIds: [],
    lockedIds: [],
  };

  if (!learner?.goal) return empty;

  const { conceptById, slugById, titleById } = await loadConcepts(userId);
  const pathItems: PathItem[] = Array.isArray(learner.path) ? learner.path : [];
  const mastery = learner.mastery ?? {};

  const masteryOf = (conceptId: number): number => {
    const slug = slugById.get(conceptId);
    return slug ? (mastery[slug] ?? 0) : 0;
  };

  /**
   * The card description. `path[i].why` is the model's own line for this
   * concept and is what should be shown. The deterministic path builders used
   * to write one templated sentence into every row, so rows that still hold
   * that shape are replaced here with a line that names this concept's own
   * prerequisites — otherwise every card reads the same.
   */
  const describeWhy = (item: PathItem, concept: ConceptRow | undefined): string => {
    const stored = typeof item.why === "string" ? item.why.trim() : "";
    const isTemplated =
      stored === "" ||
      /^Prerequisites are met, so .+ is unblocked next\.$/.test(stored) ||
      /^Easiest entry point — .+ unlocks the rest of the graph\.$/.test(stored) ||
      /^Nothing is standing between you and .+ — its prerequisites are already met\.$/.test(
        stored
      );
    if (!isTemplated) return stored;

    const unmet = (Array.isArray(concept?.prerequisites) ? concept?.prerequisites ?? [] : [])
      .filter((id) => masteryOf(id) < MASTERED_AT)
      .map((id) => titleById.get(id))
      .filter((title): title is string => Boolean(title));

    if (unmet.length > 0) {
      return `Builds on ${unmet.slice(0, 2).join(" and ")}, so it comes after ${
        unmet.length === 1 ? "it" : "them"
      }.`;
    }
    return concept
      ? `Everything ${concept.title} depends on is already mastered — start here.`
      : "A concept on your learning path.";
  };

  /**
   * A concept is playable once every prerequisite is mastered. No prerequisites
   * means always open. A prerequisite we cannot resolve to a slug counts as not
   * mastered, so an unresolvable graph locks rather than silently opening.
   */
  const isUnlocked = (concept: ConceptRow | undefined): boolean => {
    if (!concept) return false;
    const prerequisites = Array.isArray(concept.prerequisites) ? concept.prerequisites : [];
    if (prerequisites.length === 0) return true;
    return prerequisites.every((id) => masteryOf(id) >= MASTERED_AT);
  };

  /**
   * Progress is stored per (concept, tier), and the lesson page can fall back
   * to a different tier than the path records when a tier has no timeline. So
   * "did they finish this concept" is asked across every tier it could have
   * been recorded under.
   */
  const completionMap = learner.concept_completed_at ?? {};
  const lessonProgress = learner.lesson_progress ?? {};
  const isCompleted = (conceptId: number): boolean =>
    TIERS.some((tierKey) => {
      const key = `${conceptId}:${tierKey}`;
      if (typeof completionMap[key] === "string") return true;
      // Learners who finished before concept_completed_at existed only have
      // the lesson_progress stamp, so fall back to it.
      const stamp = lessonProgress[key]?.completed_at;
      return typeof stamp === "string";
    });

  /**
   * What counts as done, in one place: the lesson finished (concept_completed_at
   * on any tier) or the concept already mastered. The cards render those as
   * COMPLETED and MASTERED, and the car skips them, so the three agree.
   */
  const doneIds = new Set(
    pathItems
      .filter((item) => {
        const slug = conceptById.get(item.concept_id)?.slug ?? "";
        const score = slug ? (mastery[slug] ?? 0) : 0;
        return isCompleted(item.concept_id) || score >= MASTERED_AT;
      })
      .map((item) => item.concept_id)
  );

  // Where the learner stands is the first concept still to do, not
  // learner.current_concept: that column is written at only a few moments, so it
  // can lag a finished lesson and leave both the car and the CURRENT card parked
  // on something already finished. Card and road now read this one index.
  const nextUncompletedIndex = pathItems.findIndex(
    (item) => !doneIds.has(item.concept_id)
  );
  // Nothing left to do: stay on the final stop rather than falling off the end.
  const baseCurrentIndex =
    nextUncompletedIndex >= 0 ? nextUncompletedIndex : pathItems.length - 1;

  /**
   * Unlocking is hybrid: prerequisites met AND within two positions of the
   * current concept. Prerequisites alone open three or four concepts at once
   * once a shared foundation like python-basics is mastered, which leaves the
   * learner without a clear next step. The window keeps the path guided.
   */
  const isWithinRange = (index: number): boolean => index <= baseCurrentIndex + 2;
  const isUnlockedHybrid = (concept: ConceptRow | undefined, index: number): boolean =>
    Boolean(concept) && isUnlocked(concept) && isWithinRange(index);

  const pathView: PathViewItem[] = pathItems.map((item, index) => {
    const concept = conceptById.get(item.concept_id);
    const slug = concept?.slug ?? "";
    const score = slug ? (mastery[slug] ?? 0) : 0;
    const isMastered = score >= MASTERED_AT;
    const tier = resolveTier(item.tier);
    const completed = isCompleted(item.concept_id);
    const unlocked = isUnlockedHybrid(concept, index);
    const isCurrentConcept = index === baseCurrentIndex;

    // Ladder: what the learner has already done outranks where they are, which
    // outranks what they may open next. Exactly one card is CURRENT, and it is
    // the one the car sits above. Mastered and completed outrank current on
    // purpose — once a concept is done it is history, whichever slot it sits in.
    let status: PathViewItem["status"];
    if (isMastered) status = "mastered";
    else if (completed) status = "completed";
    else if (isCurrentConcept) status = "current";
    else if (unlocked) status = "upcoming";
    else status = "locked";

    return {
      key: `${item.concept_id}-${index}`,
      conceptId: item.concept_id,
      title: concept?.title ?? `Concept #${item.concept_id}`,
      why: describeWhy(item, concept),
      tier,
      tierLabelText: tierLabel(tier),
      score,
      status,
      slug,
    };
  });

  const totalConcepts = pathView.length;

  // Roadmap inputs, off the same sources the cards used: doneIds for completion
  // and mastery, baseCurrentIndex for the car, and the status pass for locked.
  const completedIds = pathItems
    .filter((item) => doneIds.has(item.concept_id))
    .map((item) => item.concept_id);
  const masteredIds = pathView
    .filter((p) => p.status === "mastered")
    .map((p) => p.conceptId);
  const lockedIds = pathView
    .filter((p) => p.status === "locked")
    .map((p) => p.conceptId);
  const carConceptId = pathItems[baseCurrentIndex]?.concept_id ?? null;

  const roadmap: RoadmapProps = {
    path: pathItems,
    completedIds,
    masteredIds,
    lockedIds,
    carConceptId,
    conceptTitles: Object.fromEntries(pathView.map((p) => [p.conceptId, p.title])),
  };

  return { pathView, totalConcepts, roadmap, completedIds, masteredIds, lockedIds };
});

/**
 * Review needs two things nothing on the learner row holds: when each concept
 * was last seen (learner_concepts, migration 013) and how their test sittings
 * went (test_attempts). Both are optional reads — while 013 is unapplied there
 * is no last_seen at all, which yields no candidates, so the card simply stays
 * hidden rather than the dashboard erroring. The two reads run in parallel.
 */
export const loadReviewData = cache(
  async (userId: string): Promise<ReviewCandidate[]> => {
    const learner = await loadLearner(userId);
    if (!learner?.goal) return [];

    const pathItems: PathItem[] = Array.isArray(learner.path) ? learner.path : [];
    const pathIds = pathItems.map((p) => p.concept_id);
    const { slugById, titleById } = await loadConcepts(userId);
    const mastery = learner.mastery ?? {};
    const supabase = await getSupabase();

    const [{ data: seenRows }, { data: attemptRows }] = await Promise.all([
      pathIds.length > 0
        ? supabase
            .from("learner_concepts")
            .select("concept_id, last_seen")
            .eq("user_id", userId)
            .in("concept_id", pathIds)
        : Promise.resolve({ data: [] as unknown[] }),
      pathIds.length > 0
        ? supabase
            .from("test_attempts")
            .select("concept_id, passed, created_at")
            .eq("user_id", userId)
            .in("concept_id", pathIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    if (!seenRows) {
      console.warn(
        "[me] learner_concepts unavailable — review is off until migration 013 is applied"
      );
    }

    const lastSeenByConcept = new Map<number, string>();
    for (const row of (seenRows ?? []) as { concept_id: number; last_seen: string }[]) {
      if (typeof row.last_seen === "string") {
        lastSeenByConcept.set(row.concept_id, row.last_seen);
      }
    }

    return reviewCandidates({
      pathItems,
      slugById,
      titleById,
      mastery,
      lastSeenByConcept,
      attempts: (attemptRows ?? []) as {
        concept_id: number;
        passed: boolean;
        created_at: string;
      }[],
    });
  }
);

/** Latest feedback interests, for the "What the AI knows about you" card. */
export const loadFeedbackInterests = cache(
  async (userId: string): Promise<string[]> => {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("feedback")
      .select("interests")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<FeedbackRow[]>();

    return (data?.[0]?.interests ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
);

/**
 * Certificate status. A missing table (migration 010 pending) just means
 * nothing is issued yet, so a failed read becomes `null` rather than throwing.
 */
export const loadCertificate = cache(
  async (userId: string): Promise<{ issuedAt: string | null }> => {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("certificates")
      .select("issued_at")
      .eq("user_id", userId)
      .limit(1);
    const issuedAt =
      (data?.[0] as { issued_at?: string } | undefined)?.issued_at ?? null;
    return { issuedAt };
  }
);
