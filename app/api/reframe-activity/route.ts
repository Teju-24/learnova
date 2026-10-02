import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateCompletion, isRateLimitError } from "@/lib/llm/groq";
import { ACTIVITY_REFRAME_PROMPT } from "@/lib/llm/prompts";
import { InteractionItemSchema } from "@/lib/content-schema";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conceptId: z.number().int().positive(),
  tier: z.string().min(1),
  sequenceIndex: z.number().int().min(0),
});

/**
 * The activity types that carry a single stretch of prose a reframe can
 * replace. drag_match and order_steps are excluded because their text lives in
 * `pairs` / `items` arrays where a reworded sentence has nowhere to go without
 * breaking the matching.
 *
 * spot_mistake is deliberately excluded: the component renders only the code
 * block, and rewriting either the code or the explanation would move the wrong
 * line and change the correct answer.
 */
const REFRAMEABLE = new Set([
  "fill_blank",
  "predict",
  "explain",
  "code_editor",
]);

type LearnerRow = {
  background: string | null;
  goal: string | null;
  comfort: unknown;
  profile_version: number;
  personalized_activities: unknown;
};

type CachedReframe = {
  prompt?: unknown;
  sentence?: unknown;
  profile_version?: unknown;
};

/**
 * The text a learner actually reads for an activity. `predict` stores its
 * question in `question` and `fill_blank` in `sentence`, so the single
 * `prompt` the model returns has to be routed to the right field.
 */
function reframeActivity(
  base: z.infer<typeof InteractionItemSchema>,
  prompt: string,
  sentence: string | null
): z.infer<typeof InteractionItemSchema> {
  switch (base.type) {
    case "predict":
      return { ...base, question: prompt };
    case "explain":
    case "code_editor":
      return { ...base, prompt };
    case "fill_blank": {
      // The sentence carries the blank and is what the learner reads, so a
      // missing or blank-free reframe is discarded rather than shown.
      const next = sentence && sentence.includes("___") ? sentence : base.sentence;
      return { ...base, sentence: next };
    }
    default:
      return base;
  }
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

/**
 * Reads one entry out of the cache without trusting its shape. A cached entry
 * counts as usable when it carries either a prompt or a blank-bearing
 * sentence, because fill_blank entries legitimately store an empty prompt.
 */
function readCached(entry: unknown): { prompt: string; sentence: string | null } | null {
  if (!entry || typeof entry !== "object") return null;
  const cached = entry as CachedReframe;
  const prompt = typeof cached.prompt === "string" ? cached.prompt : "";
  const sentence =
    typeof cached.sentence === "string" ? cached.sentence : null;
  if (!prompt && !(sentence && sentence.includes("___"))) return null;
  return { prompt, sentence };
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

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { conceptId, tier, sequenceIndex } = parsed.data;

  const { data: learnerRows, error: learnerError } = await supabase
    .from("learners")
    .select(
      "background, goal, comfort, profile_version, personalized_activities"
    )
    .eq("user_id", user.id)
    .limit(1)
    .returns<LearnerRow[]>();

  if (learnerError) {
    console.error("[api/reframe] learner lookup failed:", learnerError.message);
    return NextResponse.json(
      { ok: false, error: "learner lookup failed" },
      { status: 500 }
    );
  }

  const learner = learnerRows?.[0];
  if (!learner) {
    return NextResponse.json(
      { ok: false, error: "learner not found" },
      { status: 404 }
    );
  }

  const { data: tlRows, error: tlError } = await supabase
    .from("concept_timeline")
    .select("timeline")
    .eq("concept_id", conceptId)
    .eq("tier", tier)
    .limit(1);

  if (tlError) {
    console.error("[api/reframe] timeline lookup failed:", tlError.message);
    return NextResponse.json(
      { ok: false, error: "timeline lookup failed" },
      { status: 500 }
    );
  }

  const timeline = (tlRows?.[0] as { timeline?: unknown } | undefined)
    ?.timeline;
  const entry = Array.isArray(timeline) ? timeline[sequenceIndex] : undefined;
  const activity =
    entry && typeof entry === "object" && "activity" in entry
      ? (entry as { activity: unknown }).activity
      : undefined;

  // Re-validated rather than trusted: the row is JSONB that predates this
  // route, and the activity is about to be merged with model output.
  const baseResult = InteractionItemSchema.safeParse(activity);
  if (!baseResult.success) {
    return NextResponse.json(
      { ok: false, error: "no reframeable activity at that position" },
      { status: 404 }
    );
  }
  const base = baseResult.data;
  if (!REFRAMEABLE.has(base.type)) {
    return NextResponse.json(
      { ok: false, error: "activity type is not reframable" },
      { status: 400 }
    );
  }

  const key = `${conceptId}:${tier}:${sequenceIndex}`;
  const cache =
    learner.personalized_activities &&
    typeof learner.personalized_activities === "object"
      ? (learner.personalized_activities as Record<string, unknown>)
      : {};

  const cachedEntry = cache[key];
  const cachedVersion = (cachedEntry as CachedReframe | undefined)
    ?.profile_version;
  const cacheIsCurrent = cachedVersion === learner.profile_version;
  const cached = cacheIsCurrent ? readCached(cachedEntry) : null;

  if (cached) {
    return NextResponse.json({
      ok: true,
      activity: reframeActivity(base, cached.prompt, cached.sentence),
      framed: true,
      cached: true,
    });
  }

  const profile = {
    background: learner.background,
    goal: learner.goal,
    comfort: learner.comfort,
  };

  // A learner with no background gets the shared wording: there is nothing to
  // reframe towards, and an invented domain would be worse than the original.
  if (!learner.background || !learner.background.trim()) {
    return NextResponse.json({ ok: true, activity: base, framed: false, cached: true });
  }

  // generateCompletion, not classifyResponse: Groq's forced `json_object` mode
  // rejects this task's output outright (400 json_validate_failed, reproduced
  // 3/3 on fill_blank, where the blank marker appears in the generated text).
  // The quality model returns the same object unforced, and the zod parse below
  // is what actually guarantees the shape.
  //
  // A model hiccup is worth one retry before falling back to the base activity.
  let reframed: { prompt: string; sentence: string | null } | null = null;
  for (let attempt = 0; attempt < 2 && !reframed; attempt++) {
    try {
      const raw = await generateCompletion(
        ACTIVITY_REFRAME_PROMPT.system,
        ACTIVITY_REFRAME_PROMPT.user({ base_activity: base, profile })
      );
      const parsedReframe = z
        .object({
          prompt: z.string().optional(),
          sentence: z.string().nullable().optional(),
        })
        .safeParse(JSON.parse(stripFences(raw)));

      if (!parsedReframe.success) {
        throw new Error(
          `unusable reframe: ${parsedReframe.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`
        );
      }

      const { prompt, sentence } = parsedReframe.data;
      // fill_blank is carried by its sentence, and the model often leaves
      // prompt empty for it, so the two types have different requirements.
      if (base.type === "fill_blank") {
        if (!sentence || !sentence.includes("___")) {
          throw new Error("fill_blank reframe lost the blank");
        }
        reframed = { prompt: "", sentence };
      } else {
        if (!prompt) throw new Error("reframe returned no prompt");
        reframed = { prompt, sentence: sentence ?? null };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = attempt === 0 && !isRateLimitError(err);
      console.error(
        `[api/reframe] generation failed${
          isRateLimitError(err) ? " (rate limited)" : ""
        }${retryable ? " (retrying once)" : ""}: ${message}`
      );
      if (!retryable) break;
    }
  }

  // `framed: false` tells the client not to remember this step, so a transient
  // failure costs one unpersonalised activity rather than the whole session.
  if (!reframed) {
    return NextResponse.json({ ok: true, activity: base, framed: false, cached: true });
  }

  const merged = reframeActivity(base, reframed.prompt, reframed.sentence);

  // Only a reframe that actually changed the wording is worth storing.
  if (questionOf(merged) === questionOf(base)) {
    return NextResponse.json({ ok: true, activity: base, framed: false, cached: true });
  }

  const nextCache = {
    ...cache,
    [key]: {
      prompt: reframed.prompt,
      sentence: reframed.sentence,
      generated_at: new Date().toISOString(),
      profile_version: learner.profile_version,
    },
  };

  const { error: updateError } = await supabase
    .from("learners")
    .update({
      personalized_activities: nextCache,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    // Caching is an optimisation; the reframe itself is already usable.
    console.error("[api/reframe] cache write failed:", updateError.message);
  }

  return NextResponse.json({
    ok: true,
    activity: merged,
    framed: true,
    cached: false,
  });
}

/** The text the learner currently reads, used to detect a no-op reframe. */
function questionOf(base: z.infer<typeof InteractionItemSchema>): string {
  switch (base.type) {
    case "predict":
      return base.question;
    case "explain":
    case "code_editor":
      return base.prompt;
    case "fill_blank":
      return base.sentence;
    default:
      return "";
  }
}
