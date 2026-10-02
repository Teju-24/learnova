import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity, MASTERY, clampMastery, touchConceptSeen } from "@/lib/gamification";
import { countMasteredConcepts } from "@/lib/tier";

export const dynamic = "force-dynamic";

/** Concepts completed between light check-ins before we ask for feedback again. */
const FEEDBACK_EVERY = 2;
/** Every 5 completed concepts the learner gets the deeper check-in instead. */
const DEEP_FEEDBACK_EVERY = 5;

const VerdictSchema = z.enum(["correct", "partial", "wrong"]);

/** One graded test question, as reported by the client. */
const ReviewAnswerSchema = z.object({
  index: z.number().int().min(0).max(4),
  question: z.string(),
  userAnswer: z.string(),
  correct: z.boolean(),
  verdict: VerdictSchema,
  reason: z.string(),
});

const BodySchema = z.object({
  conceptId: z.number().int().positive(),
  tier: z.string().min(1),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  answers: z.array(ReviewAnswerSchema).length(5),
});

type LessonProgressEntry = {
  last_step?: unknown;
  completed_at?: unknown;
};

type StoredLessonProgress = {
  last_step: number;
  completed_at: string | null;
};

type WeaknessEntry = {
  weak_sections?: unknown;
  review_step?: unknown;
};

type TestReviewEntry = {
  questions: unknown[];
  answers: { index: number; userAnswer: string; correct: boolean }[];
  verdicts: string[];
  reasons: string[];
  submitted_at: string;
};

type MasteryRow = {
  mastery: Record<string, number> | null;
  lesson_progress: Record<string, LessonProgressEntry> | null;
  weakness_sections: Record<string, WeaknessEntry> | null;
  test_reviews: Record<string, TestReviewEntry> | null;
  last_feedback_at_concept_count: number | null;
  show_deep_feedback_prompt: boolean | null;
  last_deep_feedback_at: number | null;
  concept_completed_at: Record<string, unknown> | null;
};

type SlugRow = {
  slug: string;
};

type TimelineItemRow = {
  type?: unknown;
  section_id?: unknown;
};

/**
 * Which lesson section each test question exercises. A wrong answer here is
 * the signal that the matching section is a weak spot.
 */
const SECTION_FOR_QUESTION_INDEX: Record<number, string> = {
  0: "deep_explanation.0",
  1: "deep_explanation.0",
  2: "deep_explanation.1",
  3: "common_mistakes",
  4: "real_world_usage",
};

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { conceptId, tier, score, passed, answers } = parsed.data;
  const key = `${conceptId}:${tier}`;

  // Checked before the insert: passing a test only pays out Sparks the first
  // time. Retakes still record the attempt and still refine mastery.
  const { data: priorTests } = await supabase
    .from("test_attempts")
    .select("id")
    .eq("user_id", user.id)
    .eq("concept_id", conceptId)
    .eq("tier", tier)
    .limit(1);
  const isFirstAttempt = (priorTests?.length ?? 0) === 0;

  const { error: insertError } = await supabase.from("test_attempts").insert({
    user_id: user.id,
    concept_id: conceptId,
    tier,
    score,
    passed,
    answers,
  });

  if (insertError) {
    console.error("[api/test-submit] insert failed:", insertError.message);
    return NextResponse.json(
      { ok: false, error: "could not record attempt" },
      { status: 500 }
    );
  }

  // The stored question objects let the result page render the full answer
  // key on a later visit, without another AI call.
  const { data: testRows } = await supabase
    .from("concept_test")
    .select("questions")
    .eq("concept_id", conceptId)
    .eq("tier", tier)
    .limit(1);
  const storedQuestions = (
    testRows?.[0] as { questions?: unknown } | undefined
  )?.questions;

  const weakSections: string[] = [];
  for (const answer of answers) {
    if (answer.verdict === "correct") continue;
    const section = SECTION_FOR_QUESTION_INDEX[answer.index];
    if (section && !weakSections.includes(section)) {
      weakSections.push(section);
    }
  }

  // The review path starts at the earliest weak section in the timeline.
  let reviewStep = 0;
  if (weakSections.length > 0) {
    const { data: timelineRows } = await supabase
      .from("concept_timeline")
      .select("timeline")
      .eq("concept_id", conceptId)
      .eq("tier", tier)
      .limit(1);
    const timeline = (
      timelineRows?.[0] as { timeline?: unknown } | undefined
    )?.timeline;

    if (Array.isArray(timeline)) {
      for (let i = 0; i < timeline.length; i += 1) {
        const item = timeline[i] as TimelineItemRow | undefined;
        if (
          item &&
          item.type === "section" &&
          typeof item.section_id === "string" &&
          weakSections.includes(item.section_id)
        ) {
          reviewStep = i;
          break;
        }
      }
    }
  }

  // show_deep_feedback_prompt / last_deep_feedback_at arrive with migration
  // 007 and concept_completed_at with migration 008. If those are not there yet
  // the select fails outright, so fall back through the older column lists
  // instead of losing the whole submission.
  let learnerRows: MasteryRow[] | null = null;
  {
    const BASE_COLUMNS =
      "mastery, lesson_progress, weakness_sections, test_reviews, last_feedback_at_concept_count";

    const { data, error } = await supabase
      .from("learners")
      .select(
        `${BASE_COLUMNS}, show_deep_feedback_prompt, last_deep_feedback_at, concept_completed_at`
      )
      .eq("user_id", user.id)
      .limit(1)
      .returns<MasteryRow[]>();

    if (error) {
      console.error("[api/test-submit] learner select failed:", error.message);
      const withDeep = await supabase
        .from("learners")
        .select(`${BASE_COLUMNS}, show_deep_feedback_prompt, last_deep_feedback_at`)
        .eq("user_id", user.id)
        .limit(1)
        .returns<MasteryRow[]>();

      if (withDeep.error) {
        const retry = await supabase
          .from("learners")
          .select(BASE_COLUMNS)
          .eq("user_id", user.id)
          .limit(1)
          .returns<MasteryRow[]>();
        learnerRows = retry.data;
      } else {
        learnerRows = withDeep.data;
      }
    } else {
      learnerRows = data;
    }
  }

  const learner = learnerRows?.[0];
  if (!learner) {
    return NextResponse.json({ ok: false, error: "learner not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  // The unlock map, keyed `${concept_id}:${tier}`, guarded against the same
  // prototype-pollution keys the other maps below skip.
  const conceptCompletion: Record<string, unknown> = {};
  for (const [entryKey, value] of Object.entries(
    learner.concept_completed_at ?? {}
  )) {
    if (UNSAFE_KEYS.has(entryKey)) continue;
    conceptCompletion[entryKey] = value;
  }

  const questions = Array.isArray(storedQuestions) && storedQuestions.length > 0
    ? storedQuestions
    : answers.map((a) => ({ index: a.index, question: a.question }));

  const review: TestReviewEntry & {
    weak_sections: string[];
    review_step: number;
  } = {
    questions,
    answers: answers.map((a) => ({
      index: a.index,
      userAnswer: a.userAnswer,
      correct: a.correct,
    })),
    verdicts: answers.map((a) => a.verdict),
    reasons: answers.map((a) => a.reason),
    submitted_at: nowIso,
    weak_sections: weakSections,
    review_step: reviewStep,
  };

  const lessonProgress: Record<string, StoredLessonProgress> = {};
  for (const [entryKey, entry] of Object.entries(learner.lesson_progress ?? {})) {
    if (UNSAFE_KEYS.has(entryKey)) continue;
    lessonProgress[entryKey] = {
      last_step: typeof entry.last_step === "number" ? entry.last_step : 0,
      completed_at:
        typeof entry.completed_at === "string" ? entry.completed_at : null,
    };
  }
  const weaknessSections: Record<string, WeaknessEntry> = {};
  for (const [entryKey, entry] of Object.entries(
    learner.weakness_sections ?? {}
  )) {
    if (UNSAFE_KEYS.has(entryKey)) continue;
    weaknessSections[entryKey] = entry;
  }
  const testReviews: Record<string, TestReviewEntry> = {};
  for (const [entryKey, entry] of Object.entries(learner.test_reviews ?? {})) {
    if (UNSAFE_KEYS.has(entryKey)) continue;
    testReviews[entryKey] = entry;
  }

  weaknessSections[key] = { weak_sections: weakSections, review_step: reviewStep };
  testReviews[key] = {
    questions: review.questions,
    answers: review.answers,
    verdicts: review.verdicts,
    reasons: review.reasons,
    submitted_at: review.submitted_at,
  };

  const update: Record<string, unknown> = {
    weakness_sections: weaknessSections,
    test_reviews: testReviews,
    updated_at: nowIso,
  };

  // Mastery after this attempt, so the client can update the ring live instead
  // of waiting for a navigation. Stays null when the pass did not change it.
  let newMastery: number | null = null;

  if (passed) {
    // Passing marks the lesson done, so a later visit opens on the review
    // path rather than at step 0. The last step is preserved.
    const existing = lessonProgress[key];
    lessonProgress[key] = {
      last_step: typeof existing?.last_step === "number" ? existing.last_step : 0,
      completed_at: nowIso,
    };
    update.lesson_progress = lessonProgress;

    // Passing sets a mastery floor. Monotonic by construction: a learner who
    // already earned more keeps it, and passing can never pull them down.
    {
      const { data: conceptRows } = await supabase
        .from("concepts")
        .select("slug")
        .eq("id", conceptId)
        .limit(1)
        .returns<SlugRow[]>();

      const slug = conceptRows?.[0]?.slug;
      if (slug) {
        const mastery = learner.mastery ?? {};
        const old = mastery[slug] ?? 0;
        newMastery = clampMastery(Math.max(old, MASTERY.PASS_FLOOR));
        update.mastery = { ...mastery, [slug]: newMastery };
      }
    }

    // Passing the test completes the concept, whichever came first. The
    // timeline-finish path writes the same field from /api/lesson-progress,
    // so a learner who did not pass is not held back either.
    {
      const current = conceptCompletion;
      if (typeof current[key] !== "string") {
        update.concept_completed_at = { ...current, [key]: nowIso };
      }
    }

    // Checkpoints: a light check-in every FEEDBACK_EVERY concepts since the
    // last one, and a deeper check-in on every DEEP_FEEDBACK_EVERY boundary.
    // The flags stay raised until they are answered, so a learner who never
    // opens the dashboard still sees them next time.
    const effectiveMastery =
      (update.mastery as Record<string, number> | undefined) ??
      learner.mastery ??
      {};
    const completed = countMasteredConcepts(effectiveMastery);
    const lastCount = learner.last_feedback_at_concept_count ?? 0;
    if (completed - lastCount >= FEEDBACK_EVERY) {
      update.show_feedback_prompt = true;
    }

    const lastDeep = learner.last_deep_feedback_at ?? 0;
    if (
      completed > 0 &&
      completed % DEEP_FEEDBACK_EVERY === 0 &&
      completed !== lastDeep
    ) {
      update.show_deep_feedback_prompt = true;
    }
  }

  const { error: updateError } = await supabase
    .from("learners")
    .update(update)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[api/test-submit] learner update failed:", updateError.message);

    // The checkpoint columns arrive with migrations 006/007. If any is
    // missing, PostgREST rejects the whole update, taking the review data
    // down with it. Retry without the checkpoints so the result screen still
    // renders; they are re-evaluated on the next passing test.
    let savedWithoutCheckpoint = false;
    if (
      "show_feedback_prompt" in update ||
      "show_deep_feedback_prompt" in update ||
      "concept_completed_at" in update
    ) {
      const {
        show_feedback_prompt: _checkpoint,
        show_deep_feedback_prompt: _deepCheckpoint,
        concept_completed_at: _completion,
        ...rest
      } = update;
      void _checkpoint;
      void _deepCheckpoint;
      void _completion;
      const { error: retryError } = await supabase
        .from("learners")
        .update(rest)
        .eq("user_id", user.id);
      if (retryError) {
        console.error(
          "[api/test-submit] learner update failed without checkpoint:",
          retryError.message
        );
      } else {
        savedWithoutCheckpoint = true;
        console.error(
          "[api/test-submit] feedback checkpoints skipped — are migrations 006/007 applied?"
        );
      }
    }

    if (!savedWithoutCheckpoint) {
      return NextResponse.json(
        { ok: false, error: "could not save review" },
        { status: 500 }
      );
    }
  }

  let sparks = 0;
  let newBadges: { id: string; name: string; description: string; icon: string }[] = [];
  let totalSparks = 0;

  if (passed) {
    try {
      const result = await recordActivity(
        supabase,
        user.id,
        {
          kind: "test_pass",
          score,
        },
        { skipSparks: !isFirstAttempt }
      );
      sparks = result.sparks;
      newBadges = result.newBadges;
      totalSparks = result.totalSparks;
    } catch (err) {
      console.error("[api/test-submit] gamification:", err);
    }
  }

  // Sitting the test is a definite sighting, and it must be recorded whether the
  // attempt passed or failed: a failure is exactly what review mode keys off,
  // and a pass is what should stop the concept being raised again.
  await touchConceptSeen(supabase, conceptId);

  return NextResponse.json({
    ok: true,
    passed,
    score,
    sparks,
    newBadges,
    totalSparks,
    new_mastery: newMastery,    review: {
      questions: review.questions,
      answers: review.answers,
      verdicts: review.verdicts,
      reasons: review.reasons,
      weak_sections: weakSections,
      review_step: reviewStep,
    },
  });
}
