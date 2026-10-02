import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GOAL_BOUNDS } from "@/lib/learner";

export const dynamic = "force-dynamic";

/**
 * Bounds come from lib/learner so the number inputs in
 * components/WeeklyGoals.tsx and this validator cannot disagree.
 */
const GoalsBodySchema = z.object({
  weekly_goal_concepts: z
    .number()
    .int()
    .min(GOAL_BOUNDS.weekly_goal_concepts.min)
    .max(GOAL_BOUNDS.weekly_goal_concepts.max),
  weekly_goal_minutes: z
    .number()
    .int()
    .min(GOAL_BOUNDS.weekly_goal_minutes.min)
    .max(GOAL_BOUNDS.weekly_goal_minutes.max),
});

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = GoalsBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { weekly_goal_concepts, weekly_goal_minutes } = parsed.data;

    const { data, error } = await supabase
      .from("learners")
      .update({
        weekly_goal_concepts,
        weekly_goal_minutes,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("weekly_goal_concepts, weekly_goal_minutes")
      .single();

    if (error) {
      // 42703 is undefined_column: migration 012 has not been applied to this
      // project yet. Distinguish it so the UI can say "not available" instead
      // of showing a generic save failure.
      const missingColumn =
        error.code === "42703" ||
        /weekly_goal_(concepts|minutes)/i.test(error.message);
      if (missingColumn) {
        console.error(
          "[goals] learners.weekly_goal_* is missing — apply migration 012:",
          error.message
        );
        return NextResponse.json(
          {
            error:
              "Weekly goals are not set up on this project yet — migration 012 has not been applied.",
          },
          { status: 503 }
        );
      }
      console.error("[goals] update failed:", error.message);
      return NextResponse.json(
        { error: "Could not save your goals" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      weekly_goal_concepts: data.weekly_goal_concepts,
      weekly_goal_minutes: data.weekly_goal_minutes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[goals] unexpected failure:", message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
