import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { touchConceptSeen } from "@/lib/gamification";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conceptId: z.number().int().positive(),
  tier: z.string().min(1),
  lastStep: z.number().int().min(0),
  /** How many activities the learner has answered in this visit. */
  activitiesAnswered: z.number().int().min(0).optional().default(0),
});

type ProgressEntry = {
  last_step?: unknown;
  completed_at?: unknown;
};

type StoredEntry = {
  last_step: number;
  completed_at: string | null;
};

type CompletionMap = Record<string, unknown>;

type ProgressRow = {
  lesson_progress: Record<string, ProgressEntry> | null;
  concept_completed_at?: CompletionMap | null;
};

type TimelineRow = {
  timeline: unknown;
};

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Marks the (concept, tier) as done when the learner reached the last step of
 * the seeded timeline AND answered at least one activity — i.e. they finished
 * the lesson, whether or not they went on to pass the test. Passing the test
 * also writes this, from /api/test-submit.
 */
async function markConceptCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  key: string,
  nowIso: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("learners")
    .select("concept_completed_at")
    .eq("user_id", userId)
    .limit(1)
    .returns<Array<{ concept_completed_at: CompletionMap | null }>>();

  // Migration 008 not applied yet: progress still saves, completion just
  // cannot be recorded. The test-pass path in /api/test-submit is unaffected.
  if (error) return false;

  const current = data?.[0]?.concept_completed_at ?? {};
  if (typeof current[key] === "string") return true;

  const next: Record<string, unknown> = {};
  for (const [entryKey, value] of Object.entries(current)) {
    if (UNSAFE_KEYS.has(entryKey)) continue;
    next[entryKey] = value;
  }
  next[key] = nowIso;

  const { error: updateError } = await supabase
    .from("learners")
    .update({ concept_completed_at: next, updated_at: nowIso })
    .eq("user_id", userId);

  if (updateError) {
    console.error(
      "[api/lesson-progress] concept completion write failed:",
      updateError.message
    );
    return false;
  }
  return true;
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

  const { conceptId, tier, lastStep, activitiesAnswered } = parsed.data;
  const nowIso = new Date().toISOString();

  // concept_completed_at arrives with migration 008; fall back to the columns
  // that always exist so progress keeps saving before it is applied.
  let learnerRows: ProgressRow[] | null = null;
  {
    const { data, error } = await supabase
      .from("learners")
      .select("lesson_progress, concept_completed_at")
      .eq("user_id", user.id)
      .limit(1)
      .returns<ProgressRow[]>();

    if (error) {
      console.error("[api/lesson-progress] learner select failed:", error.message);
      const retry = await supabase
        .from("learners")
        .select("lesson_progress")
        .eq("user_id", user.id)
        .limit(1)
        .returns<ProgressRow[]>();
      learnerRows = retry.data;
    } else {
      learnerRows = data;
    }
  }

  if (!learnerRows?.[0]) {
    return NextResponse.json({ ok: false, error: "learner not found" }, { status: 404 });
  }

  const row = learnerRows[0];

  // The key is the (concept, tier) the lesson is actually running at, which is
  // the tier the page resolved and passed in — not the raw path tier, because
  // the lesson page falls back through the tier chain when a tier has no
  // timeline. This is the same key /api/test-submit and the lesson page use.
  const lessonTier = resolveTier(tier);
  const key = `${conceptId}:${lessonTier}`;

  const current = row.lesson_progress ?? {};
  const next: Record<string, StoredEntry> = {};
  for (const [entryKey, entry] of Object.entries(current)) {
    if (UNSAFE_KEYS.has(entryKey)) continue;
    next[entryKey] = {
      last_step: typeof entry.last_step === "number" ? entry.last_step : 0,
      completed_at:
        typeof entry.completed_at === "string" ? entry.completed_at : null,
    };
  }

  const existing = current[key];
  const alreadyCompletedAt =
    existing && typeof existing.completed_at === "string"
      ? existing.completed_at
      : null;

  // How long the lesson is comes from the seeded timeline, not the client.
  let totalSteps = 0;
  {
    const { data: tlRows } = await supabase
      .from("concept_timeline")
      .select("timeline")
      .eq("concept_id", conceptId)
      .eq("tier", lessonTier)
      .limit(1)
      .returns<TimelineRow[]>();
    const raw = tlRows?.[0]?.timeline;
    totalSteps = Array.isArray(raw) ? raw.length : 0;
  }

  const reachedEnd = totalSteps > 1 && lastStep >= totalSteps - 1;
  const timelineFinished = reachedEnd && activitiesAnswered > 0;

  // completed_at keeps its existing meaning — "the test was passed" — because
  // the lesson page uses it for the completed banner and the step sidebar.
  // Finishing the timeline records completion in concept_completed_at instead,
  // so nothing about how a lesson opens changes.
  next[key] = {
    last_step: lastStep,
    completed_at: alreadyCompletedAt,
  };

  const { error: upsertError } = await supabase.from("learners").upsert(
    {
      user_id: user.id,
      lesson_progress: next,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("[api/lesson-progress] upsert failed:", upsertError.message);
    return NextResponse.json(
      { ok: false, error: "could not save progress" },
      { status: 500 }
    );
  }

  // Whichever comes first — finishing the timeline or passing the test — marks
  // the concept complete and unlocks the next one.
  const completed =
    timelineFinished || alreadyCompletedAt !== null
      ? await markConceptCompleted(supabase, user.id, key, nowIso)
      : false;

  // Working through the lesson is the strongest "seen it" signal: it fires on
  // every step, so a concept the learner is actively re-reading never ages into
  // a review candidate.
  await touchConceptSeen(supabase, conceptId);

  return NextResponse.json({ ok: true, conceptCompleted: completed });
}