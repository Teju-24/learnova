import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import Dashboard from "@/components/Dashboard";
import type { RoadmapProps } from "@/components/Roadmap";
import { Container } from "@/components/Container";
import FeedbackFab from "@/components/FeedbackFab";
import { createClient } from "@/lib/supabase/server";
import {
  MASTERED_AT,
  countMasteredConcepts,
  resolveTier,
  tierLabel,
} from "@/lib/tier";
import { certificateProgress, displayName, reviewCandidates } from "@/lib/learner";

type PathItem = {
  concept_id: number;
  tier: string;
  why: string;
};

type LearnerRow = {
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

type ConceptRow = {
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

export default async function MePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The feedback flags arrive with migrations 006/007 and concept_completed_at
  // with 008. If those columns are not there yet the select fails outright,
  // which would bounce the learner back to /start, so the dashboard falls back
  // to the column list it always had.
  let learnerRows: LearnerRow[] | null = null;
  {
    const BASE_COLUMNS =
      "user_id, goal, background, mastery, path, current_concept, current_streak, sparks";
    const OPTIONAL_COLUMNS =
      ", learner_name, show_feedback_prompt, show_deep_feedback_prompt, lesson_progress, concept_completed_at";

    const { data, error } = await supabase
      .from("learners")
      .select(`${BASE_COLUMNS}${OPTIONAL_COLUMNS}`)
      .eq("user_id", user.id)
      .limit(1)
      .returns<LearnerRow[]>();

    if (error) {
      // Expected while any of 006-009 is pending, not a real failure.
      console.warn("[me] optional learner columns unavailable:", error.message);
      const retry = await supabase
        .from("learners")
        .select(BASE_COLUMNS)
        .eq("user_id", user.id)
        .limit(1)
        .returns<LearnerRow[]>();
      learnerRows = retry.data;
    } else {
      learnerRows = data;
    }
  }

  const learner = learnerRows?.[0] ?? null;

  if (!learner?.goal) {
    redirect("/start");
  }

  const pathItems: PathItem[] = Array.isArray(learner.path)
    ? learner.path
    : [];
  const mastery = learner.mastery ?? {};

  // The same "concepts completed" measure the feedback checkpoint counts, so
  // the card and the server agree on the number shown.
  const conceptsCompleted = countMasteredConcepts(mastery);

  const pathConceptIds =
    pathItems.length > 0 ? pathItems.map((p) => p.concept_id) : [-1];

  const { data: conceptRows } = await supabase
    .from("concepts")
    .select("id, slug, title, prerequisites")
    .in("id", pathConceptIds)
    .returns<ConceptRow[]>();

  const conceptById = new Map((conceptRows ?? []).map((c) => [c.id, c]));

  // Prerequisites are concept IDs and may sit outside this learner's path, but
  // mastery is keyed by slug — so resolve every prerequisite ID to its slug
  // before checking anything.
  const slugById = new Map<number, string>(
    (conceptRows ?? []).map((c) => [c.id, c.slug])
  );
  const titleById = new Map<number, string>(
    (conceptRows ?? []).map((c) => [c.id, c.title])
  );
  const prerequisiteIds = new Set<number>();
  for (const concept of conceptRows ?? []) {
    for (const id of Array.isArray(concept.prerequisites) ? concept.prerequisites : []) {
      if (typeof id === "number" && !slugById.has(id)) prerequisiteIds.add(id);
    }
  }
  if (prerequisiteIds.size > 0) {
    const { data: prereqRows } = await supabase
      .from("concepts")
      .select("id, slug, title")
      .in("id", Array.from(prerequisiteIds))
      .returns<Array<{ id: number; slug: string; title: string }>>();
    for (const row of prereqRows ?? []) {
      slugById.set(row.id, row.slug);
      titleById.set(row.id, row.title);
    }
  }

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
    const prerequisites = Array.isArray(concept.prerequisites)
      ? concept.prerequisites
      : [];
    if (prerequisites.length === 0) return true;
    return prerequisites.every((id) => masteryOf(id) >= MASTERED_AT);
  };

  // Latest feedback interests, for the "What the AI knows about you" card.
  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("interests")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<FeedbackRow[]>();

  const feedbackInterests = (feedbackRows?.[0]?.interests ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const completionMap = learner.concept_completed_at ?? {};
  const lessonProgress = learner.lesson_progress ?? {};

  // Progress is stored per (concept, tier), and the lesson page can fall back
  // to a different tier than the path records when a tier has no timeline. So
  // "did they finish this concept" is asked across every tier it could have
  // been recorded under.
  const TIERS = ["beginner", "intermediate", "advanced"] as const;

  /**
   * Finished counts the timeline reaching its last step with at least one
   * activity answered (written by /api/lesson-progress) and the test being
   * passed (written by /api/test-submit), whichever came first.
   */
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

  const pathView = pathItems.map((item, index) => {
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
    let status:
      | "mastered"
      | "completed"
      | "current"
      | "upcoming"
      | "locked";
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
    conceptTitles: Object.fromEntries(
      pathView.map((p) => [p.conceptId, p.title])
    ),
  };

  // Certificate status for the banner. Same mastery measure the issue route
  // checks, so the dashboard can never claim a certificate is earned when the
  // route would refuse it. A missing table (migration 010 pending) just means
  // nothing is issued yet.
  const certificateProgressState = certificateProgress(mastery);
  const { data: certificateRows } = await supabase
    .from("certificates")
    .select("issued_at")
    .eq("user_id", user.id)
    .limit(1);
  const certificateIssuedAt = certificateRows?.[0]?.issued_at ?? null;

  // —— Review ——
  // Needs two things nothing on the learner row holds: when each concept was
  // last seen (learner_concepts, migration 013) and how their test sittings went
  // (test_attempts). Both are optional reads — while 013 is unapplied there is
  // no last_seen at all, which yields no candidates, so the card simply stays
  // hidden rather than the dashboard erroring.
  const pathIds = pathItems.map((p) => p.concept_id);

  const [{ data: seenRows }, { data: attemptRows }] = await Promise.all([
    pathIds.length > 0
      ? supabase
          .from("learner_concepts")
          .select("concept_id, last_seen")
          .eq("user_id", user.id)
          .in("concept_id", pathIds)
      : Promise.resolve({ data: [] as unknown[] }),
    pathIds.length > 0
      ? supabase
          .from("test_attempts")
          .select("concept_id, passed, created_at")
          .eq("user_id", user.id)
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

  const reviews = reviewCandidates({
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

  return (
    <main className="min-h-screen">
      <nav
        className="sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "var(--bg-nav)" }}
      >
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="font-heading text-xl font-bold"
            style={{ textDecoration: "none" }}
          >
            Learnova
          </Link>
          <SignOutButton />
        </Container>
      </nav>

      <Container className="py-8 pb-24">
        <Dashboard
          email={user.email ?? ""}
          displayName={displayName(learner.learner_name, user.email)}
          background={learner.background}
          goal={learner.goal}
          currentStreak={learner.current_streak ?? 0}
          sparks={learner.sparks ?? 0}
          conceptsCompleted={conceptsCompleted}
          totalConcepts={totalConcepts}
          showFeedbackPrompt={learner.show_feedback_prompt ?? false}
          showDeepFeedbackPrompt={learner.show_deep_feedback_prompt ?? false}
          interests={feedbackInterests}
          pathView={pathView}
          roadmap={roadmap}
          reviewCandidates={reviews}
          certificate={{
            mastered: certificateProgressState.mastered,
            required: certificateProgressState.required,
            remaining: certificateProgressState.remaining,
            met: certificateProgressState.met,
            issuedAt: certificateIssuedAt,
          }}
        />
      </Container>

      <FeedbackFab
        conceptsCompleted={conceptsCompleted}
        learnerName={displayName(learner.learner_name, user.email)}
      />
    </main>
  );
}