import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity, nextMastery } from "@/lib/gamification";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  concept_id: z.number().int().positive(),
  score: z.number().min(0).max(1),
  // Optional so older clients keep working. When both are present the
  // activity is matched against `practice_attempts` to decide whether
  // this is a first attempt (Sparks) or a retry (no Sparks).
  tier: z.string().min(1).optional(),
  sequence: z.number().int().min(0).optional(),
  // Present only when the client is reporting a graded interaction, not a
  // plain section read. Deterministic types are recorded here so retry
  // detection works for them too; `explain` is already recorded by
  // /api/answer, which owns the model grading.
  interaction_type: z.string().min(1).optional(),
  question: z.string().optional(),
  user_answer: z.string().optional(),
});

type MasteryRow = {
  mastery: Record<string, number> | null;
};

type SlugRow = {
  slug: string;
};

/** Same thresholds the player uses, so stored verdicts match the UI. */
function verdictForScore(score: number): string {
  if (score >= 0.8) return "correct";
  if (score >= 0.4) return "partial";
  return "wrong";
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

  const {
    concept_id,
    score,
    tier,
    sequence,
    interaction_type,
    question,
    user_answer,
  } = parsed.data;

  const { data: conceptRows } = await supabase
    .from("concepts")
    .select("slug")
    .eq("id", concept_id)
    .limit(1)
    .returns<SlugRow[]>();

  const slug = conceptRows?.[0]?.slug;
  if (!slug) {
    return NextResponse.json({ ok: false, error: "unknown concept" }, { status: 400 });
  }

  const { data: learnerRows } = await supabase
    .from("learners")
    .select("mastery")
    .eq("user_id", user.id)
    .limit(1)
    .returns<MasteryRow[]>();

  if (!learnerRows?.[0]) {
    return NextResponse.json({ ok: false, error: "learner not found" }, { status: 404 });
  }

  const mastery = learnerRows[0].mastery ?? {};
  const oldMastery = mastery[slug] ?? 0;
  const newMastery = nextMastery(oldMastery, score);

  const { error: updateError } = await supabase
    .from("learners")
    .update({
      mastery: { ...mastery, [slug]: newMastery },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[api/mastery-update] failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "could not save mastery" },
      { status: 500 }
    );
  }

  let gamification = {
    sparks: 0,
    currentStreak: 0,
    newBadges: [] as { id: string; name: string; description: string; icon: string }[],
    totalSparks: 0,
  };

  // Sparks are for the first time an activity is completed. A row already
  // in `practice_attempts` for this (concept, tier, sequence) means the
  // learner has seen it before, so the attempt refines mastery but pays
  // out nothing.
  //
  // The lookup runs for every graded activity, including the model-graded
  // ones, because that is what makes a retry detectable. Only the insert is
  // restricted to the deterministic types: nothing else writes those rows,
  // whereas /api/answer already inserted the row for the model-graded
  // interactions before this request.
  const MODEL_GRADED_TYPES = new Set(["explain", "code_editor"]);
  const isGradedActivity = Boolean(tier && typeof sequence === "number");
  const shouldRecordAttempt = Boolean(
    isGradedActivity &&
      interaction_type &&
      !MODEL_GRADED_TYPES.has(interaction_type)
  );

  let isRetry = false;
  if (isGradedActivity) {
    const { data: priorRows, error: priorError } = await supabase
      .from("practice_attempts")
      .select("id")
      .eq("user_id", user.id)
      .eq("concept_id", concept_id)
      .eq("tier", tier)
      .eq("sequence", sequence)
      .limit(1);

    if (priorError) {
      console.error("[api/mastery-update] attempt lookup failed:", priorError.message);
    }
    isRetry = (priorRows?.length ?? 0) > 0;

    if (!isRetry && shouldRecordAttempt) {
      const { error: insertError } = await supabase.from("practice_attempts").insert({
        user_id: user.id,
        concept_id: concept_id,
        tier,
        sequence,
        question: question ?? null,
        user_answer: user_answer ?? null,
        verdict: verdictForScore(score),
        score,
      });
      if (insertError) {
        // Recording the attempt is bookkeeping; never fail the mastery update.
        console.error("[api/mastery-update] attempt insert failed:", insertError.message);
      }
    }
  }

  try {
    const result = await recordActivity(
      supabase,
      user.id,
      {
        kind: "interaction",
        score,
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
    console.error("[api/mastery-update] gamification:", err);
  }

  return NextResponse.json({
    ok: true,
    new_mastery: newMastery,
    retry: isRetry,
    sparks: gamification.sparks,
    currentStreak: gamification.currentStreak,
    newBadges: gamification.newBadges,
    totalSparks: gamification.totalSparks,
  });
}
