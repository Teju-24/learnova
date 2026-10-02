import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/gamification";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conceptId: z.number().int().positive(),
  tier: z.string().min(1),
});

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

  const { conceptId, tier } = parsed.data;

  try {
    const result = await recordActivity(supabase, user.id, {
      kind: "lesson_complete",
      conceptId,
      tier,
    });

    return NextResponse.json({
      ok: true,
      sparks: result.sparks,
      newBadges: result.newBadges,
      totalSparks: result.totalSparks,
      currentStreak: result.currentStreak,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/lesson-complete]", message);
    return NextResponse.json(
      { ok: false, error: "could not record lesson complete" },
      { status: 500 }
    );
  }
}
