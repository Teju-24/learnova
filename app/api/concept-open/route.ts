import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordActivity, touchConceptSeen } from "@/lib/gamification";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conceptId: z.number().int().positive(),
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

  try {
    await recordActivity(supabase, user.id, {
      kind: "concept_open",
      conceptId: parsed.data.conceptId,
    });
    // Opening a concept is the clearest "seen it" signal there is, and it is the
    // only one recorded even for a learner who bails on the first section.
    await touchConceptSeen(supabase, parsed.data.conceptId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/concept-open]", message);
    return NextResponse.json({ ok: false, error: "could not record open" }, { status: 500 });
  }
}
