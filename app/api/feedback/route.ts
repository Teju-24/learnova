import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { countMasteredConcepts } from "@/lib/tier";
import { extendPath } from "@/app/api/extend-path/route";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  pace: z.enum(["too_slow", "just_right", "too_fast"]),
  interests: z.string().trim().max(500).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  /** Which flavour of check-in this is; the deep one also carries a rating. */
  variant: z.enum(["light", "deep"]).optional().default("light"),
  rating: z.number().int().min(1).max(5).optional(),
});

type LearnerRow = {
  mastery: Record<string, number> | null;
  current_concept: number | null;
};

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

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { pace, interests, notes, variant, rating } = parsed.data;

  const { data: learnerRows, error: learnerError } = await supabase
    .from("learners")
    .select("mastery, current_concept")
    .eq("user_id", user.id)
    .limit(1)
    .returns<LearnerRow[]>();

  if (learnerError || !learnerRows?.[0]) {
    console.error("[api/feedback] learner lookup failed:", learnerError?.message);
    return NextResponse.json(
      { ok: false, error: "learner not found" },
      { status: 404 }
    );
  }

  const learner = learnerRows[0];
  const completedCount = countMasteredConcepts(learner.mastery);

  const { error: insertError } = await supabase.from("feedback").insert({
    user_id: user.id,
    concept_id:
      typeof learner.current_concept === "number" ? learner.current_concept : null,
    pace,
    interests: interests || null,
    notes: notes || null,
    variant,
    rating: rating ?? null,
  });

  if (insertError) {
    console.error("[api/feedback] insert failed:", insertError.message);
    return NextResponse.json(
      { ok: false, error: "could not record feedback" },
      { status: 500 }
    );
  }

  // Clearing the flag needs migration 006 (light) and 007 (deep); without
  // them the whole update is rejected, so try the deep bookkeeping first and
  // fall back to the light-only update.
  const learnerUpdate: Record<string, unknown> = {
    last_feedback_at_concept_count: completedCount,
    show_feedback_prompt: false,
    updated_at: new Date().toISOString(),
  };
  if (variant === "deep") {
    learnerUpdate.show_deep_feedback_prompt = false;
    learnerUpdate.last_deep_feedback_at = completedCount;
  }

  let { error: updateError } = await supabase
    .from("learners")
    .update(learnerUpdate)
    .eq("user_id", user.id);

  if (updateError && variant === "deep") {
    console.error(
      "[api/feedback] deep checkpoint reset failed:",
      updateError.message
    );
    const retry = await supabase
      .from("learners")
      .update({
        last_feedback_at_concept_count: completedCount,
        show_feedback_prompt: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    updateError = retry.error;
  }

  if (updateError) {
    console.error("[api/feedback] learner update failed:", updateError.message);
    return NextResponse.json(
      { ok: false, error: "could not clear feedback prompt" },
      { status: 500 }
    );
  }

  // Every check-in re-plans the path, not just the ones that happen to cross a
// checkpoint boundary: the new pace signal can bias tiers even when the
// frontier has not grown. Failure here must not lose the feedback that was
// just recorded, so the re-plan is best-effort.
  let path: unknown[] = [];
  let extended = false;
  try {
    const result = await extendPath(supabase, user.id, { pace });
    path = result.path;
    extended = result.ok;
  } catch (err) {
    console.error("[api/feedback] extend-path failed:", err);
  }

  return NextResponse.json({
    ok: true,
    path,
    extended,
    feedbackRecorded: true,
  });
}
