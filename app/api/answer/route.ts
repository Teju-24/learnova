import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { classifyResponse, isRateLimitError } from "@/lib/llm/groq";
import { GRADING_PROMPT } from "@/lib/llm/prompts";
import { GradingResultSchema } from "@/lib/content-schema";
import { recordActivity, nextMastery } from "@/lib/gamification";

export const dynamic = "force-dynamic";

const AnswerBodySchema = z.object({
  concept_id: z.number().int().positive(),
  tier: z.string().min(1),
  sequence: z.number().int().min(0),
  // The model-graded interactions. Everything else is scored locally and never
  // reaches this route.
  interaction_type: z.enum(["explain", "code_editor"]),
  question: z.string(),
  rubric: z.string(),
  answer: z.string(),
});

type MasteryRow = {
  mastery: Record<string, number> | null;
  profile_version: number;
};

type SlugRow = {
  slug: string;
};

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function extractJson(raw: string): unknown {
  return JSON.parse(stripFences(raw));
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const parsed = AnswerBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid body — only interaction_type 'explain' or 'code_editor' is accepted",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { concept_id, tier, sequence, question, rubric, answer } = parsed.data;

  const { data: conceptRows, error: conceptError } = await supabase
    .from("concepts")
    .select("slug")
    .eq("id", concept_id)
    .limit(1)
    .returns<SlugRow[]>();

  if (conceptError) {
    console.error("[api/answer] concept lookup failed:", conceptError.message);
    return NextResponse.json(
      { ok: false, error: "concept lookup failed" },
      { status: 500 }
    );
  }

  const slug = conceptRows?.[0]?.slug;
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "unknown concept" },
      { status: 400 }
    );
  }

  let grading;
  try {
    const raw = await classifyResponse(
      GRADING_PROMPT.system,
      GRADING_PROMPT.user(question, answer, rubric)
    );
    const result = GradingResultSchema.safeParse(extractJson(raw));
    if (!result.success) {
      console.error(
        "[api/answer] grading output invalid:",
        result.error.issues
      );
      return NextResponse.json(
        { ok: false, error: "grader returned an unusable result" },
        { status: 502 }
      );
    }
    grading = result.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/answer] grading failed${isRateLimitError(err) ? " (rate limited)" : ""}: ${message}`
    );
    return NextResponse.json(
      { ok: false, error: "grading failed" },
      { status: 502 }
    );
  }

  const { data: learnerRows, error: learnerError } = await supabase
    .from("learners")
    .select("mastery, profile_version")
    .eq("user_id", user.id)
    .limit(1)
    .returns<MasteryRow[]>();

  if (learnerError || !learnerRows?.[0]) {
    console.error("[api/answer] learner lookup failed:", learnerError?.message);
    return NextResponse.json(
      { ok: false, error: "learner not found" },
      { status: 404 }
    );
  }

  const learner = learnerRows[0];
  const mastery = learner.mastery ?? {};
  const oldMastery = mastery[slug] ?? 0;

  const newMastery = nextMastery(oldMastery, grading.score);

  const { error: updateError } = await supabase
    .from("learners")
    .update({
      mastery: { ...mastery, [slug]: newMastery },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[api/answer] mastery update failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "could not save mastery" },
      { status: 500 }
    );
  }

  // Checked before the insert below: an existing row for this
  // (concept, tier, sequence) means the learner is retrying, so the
  // attempt refines mastery but pays out no Sparks.
  const { data: priorRows, error: priorError } = await supabase
    .from("practice_attempts")
    .select("id")
    .eq("user_id", user.id)
    .eq("concept_id", concept_id)
    .eq("tier", tier)
    .eq("sequence", sequence)
    .limit(1);

  if (priorError) {
    console.error("[api/answer] attempt lookup failed:", priorError.message);
  }
  const isRetry = (priorRows?.length ?? 0) > 0;

  // Same rule as /api/mastery-update: the first try owns the row, retries
  // only refine mastery. practice_attempts has no unique key on
  // (user_id, concept_id, tier, sequence), so inserting again would pile up
  // duplicates and turn "has this been attempted?" into a permanent yes.
  if (!isRetry) {
    const { error: attemptError } = await supabase
      .from("practice_attempts")
      .insert({
        user_id: user.id,
        concept_id,
        tier,
        sequence,
        question,
        user_answer: answer,
        verdict: grading.verdict,
        score: grading.score,
        reason: grading.reason,
      });

    if (attemptError) {
      // Recording the attempt is bookkeeping; mastery is already saved, so
      // this must not fail the learner's submission.
      console.error("[api/answer] attempt insert failed:", attemptError.message);
    }
  }

  let gamification = {
    sparks: 0,
    currentStreak: 0,
    newBadges: [] as { id: string; name: string; description: string; icon: string }[],
    totalSparks: 0,
  };

  try {
    const result = await recordActivity(
      supabase,
      user.id,
      {
        kind: "interaction",
        score: grading.score,
      },
      { skipSparks: isRetry }
    );
    gamification = {
      sparks: result.sparks,
      currentStreak: result.currentStreak,
      newBadges: result.newBadges,
      totalSparks: result.totalSparks,
    };
  } catch (err) {
    console.error("[api/answer] gamification:", err);
  }

  return NextResponse.json({
    ok: true,
    verdict: grading.verdict,
    score: grading.score,
    reason: grading.reason,
    model_answer: grading.model_answer,
    new_mastery: newMastery,
    retry: isRetry,
    sparks: gamification.sparks,
    currentStreak: gamification.currentStreak,
    newBadges: gamification.newBadges,
    totalSparks: gamification.totalSparks,
  });
}
