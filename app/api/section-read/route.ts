import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/gamification";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conceptId: z.number().int().positive(),
});

/**
 * Records that the learner read a section, for Sparks and the daily-read
 * counters only.
 *
 * This used to ride along on /api/mastery-update as a fake 0.6 score, which
 * meant rereading a section moved mastery and a learner who only read
 * accumulated it. Reading is not mastery, so it is kept off the mastery write
 * entirely: nothing here touches learners.mastery.
 */
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

  // Gamification is a side effect: never fail the request over it.
  let sparks = 0;
  let newBadges: { name: string }[] = [];
  try {
    const result = await recordActivity(supabase, user.id, {
      kind: "read_section",
    });
    sparks = result.sparks;
    newBadges = result.newBadges.map((b) => ({ name: b.name }));
  } catch (err) {
    console.error("[api/section-read] gamification:", err);
  }

  return NextResponse.json({ ok: true, sparks, newBadges });
}
