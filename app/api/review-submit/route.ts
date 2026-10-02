import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nextMastery, clampMastery, touchConceptSeen } from "@/lib/gamification";
import { InteractionItemSchema, type InteractionItem } from "@/lib/content-schema";
import { resolveTier } from "@/lib/tier";

export const dynamic = "force-dynamic";

/**
 * Grading one question of a review session.
 *
 * Deliberately NOT /api/test-submit: that route is a five-question test sitting
 * that pays out Sparks, writes concept_completed_at on a pass, and flips the
 * feedback checkpoints. A review question is one question out of a bank of five,
 * so passing it must not mark a concept complete or pay anything — it only
 * nudges mastery and resets the staleness clock.
 */
const BodySchema = z.object({
  conceptId: z.number().int().positive(),
  tier: z.string().min(1),
  questionIndex: z.number().int().min(0).max(4),
  /** What the interaction component reported, in its own encoding per type. */
  userAnswer: z.string().max(4000),
  /**
   * Set when the client already graded this question through /api/answer (the
   * `explain` type does, with the model grader). Review must not move mastery a
   * second time for the same answer.
   */
  alreadyGraded: z.boolean().optional(),
});

type QuestionRow = {
  questions: unknown;
};

type LearnerRow = {
  mastery: Record<string, number> | null;
};

type SlugRow = {
  slug: string;
};

/**
 * Re-derive the grade from the stored question instead of trusting the client.
 *
 * The four deterministic types carry their own answer key, so the server can
 * settle them exactly. The client also reports correctness for instant UI
 * feedback, but only this decides mastery — otherwise a learner could post
 * `correct: true` and farm mastery.
 *
 * The answer arrives in each component's own encoding:
 *   fill_blank  -> the chosen option text
 *   predict     -> the chosen choice text
 *   order_steps -> JSON array of the ordering the learner built
 *   spot_mistake-> the 0-based line number as a string
 *   explain     -> free text, graded by the model elsewhere
 */
function gradeLocally(
  question: InteractionItem,
  userAnswer: string
): { correct: boolean; score: number } | null {
  switch (question.type) {
    case "fill_blank": {
      const options = Array.isArray(question.options) ? question.options : [];
      const picked = options.findIndex((o) => o === userAnswer);
      if (picked < 0) return null;
      const correct = picked === question.correct_index;
      return { correct, score: correct ? 1 : 0 };
    }
    case "predict": {
      const choices = Array.isArray(question.choices) ? question.choices : [];
      const picked = choices.findIndex((c) => c === userAnswer);
      if (picked < 0) return null;
      const correct = picked === question.correct_index;
      return { correct, score: correct ? 1 : 0 };
    }
    case "order_steps": {
      let submitted: unknown;
      try {
        submitted = JSON.parse(userAnswer);
      } catch {
        return null;
      }
      if (!Array.isArray(submitted)) return null;
      const expected = Array.isArray(question.correct_order)
        ? question.correct_order
        : [];
      if (expected.length === 0 || submitted.length !== expected.length) return null;
      const correct = expected.every((want, i) => submitted[i] === want);
      return { correct, score: correct ? 1 : 0 };
    }
    case "spot_mistake": {
      const line = Number.parseInt(userAnswer, 10);
      if (Number.isNaN(line)) return null;
      const correct = line === question.wrong_line;
      return { correct, score: correct ? 1 : 0 };
    }
    default:
      // explain (and anything else) is not exactly gradable here.
      return null;
  }
}

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

  const { conceptId, questionIndex, userAnswer, alreadyGraded } = parsed.data;
  const tier = resolveTier(parsed.data.tier);

  // The question comes from the database, not the request, so the client cannot
  // point at a different question or invent one.
  const { data: questionRows } = await supabase
    .from("concept_test")
    .select("questions")
    .eq("concept_id", conceptId)
    .eq("tier", tier)
    .limit(1)
    .returns<QuestionRow[]>();

  const stored = questionRows?.[0]?.questions;
  const raw =
    Array.isArray(stored) && questionIndex < stored.length
      ? stored[questionIndex]
      : null;

  const questionResult = InteractionItemSchema.safeParse(raw);
  if (!questionResult.success) {
    return NextResponse.json(
      { ok: false, error: "no such question" },
      { status: 404 }
    );
  }
  const question = questionResult.data;

  const { data: learnerRows } = await supabase
    .from("learners")
    .select("mastery")
    .eq("user_id", user.id)
    .limit(1)
    .returns<LearnerRow[]>();

  const { data: slugRows } = await supabase
    .from("concepts")
    .select("slug")
    .eq("id", conceptId)
    .limit(1)
    .returns<SlugRow[]>();

  const slug = slugRows?.[0]?.slug;
  if (!slug) {
    return NextResponse.json({ ok: false, error: "unknown concept" }, { status: 404 });
  }

  const mastery = learnerRows?.[0]?.mastery ?? {};
  const old = mastery[slug] ?? 0;

  // Already graded by the model grader (explain): the /api/answer call that came
  // with it has moved mastery already, so writing again would count one answer
  // twice. Report the stored value so the summary still has a number to show.
  if (alreadyGraded) {
    return NextResponse.json({
      ok: true,
      correct: true,
      score: 1,
      newMastery: old,
      alreadyGraded: true,
    });
  }

  const local = gradeLocally(question, userAnswer);
  const score = local?.score ?? 0;
  const correct = local?.correct ?? false;

  const newMastery = clampMastery(nextMastery(old, score));

  // Mastery is monotonic, so this never lowers it. Upsert rather than update
  // because a learner can be answered before they have a learners row.
  const { error: masteryError } = await supabase.from("learners").upsert(
    {
      user_id: user.id,
      mastery: { ...mastery, [slug]: newMastery },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (masteryError) {
    console.error("[api/review-submit] mastery update failed:", masteryError.message);
    return NextResponse.json(
      { ok: false, error: "could not save mastery" },
      { status: 500 }
    );
  }

  // Answering a review question counts as seeing the concept again, so it stops
  // being a candidate until it goes stale a second time.
  await touchConceptSeen(supabase, conceptId);

  return NextResponse.json({ ok: true, correct, score, newMastery });
}
