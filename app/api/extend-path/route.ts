import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { classifyResponse, isRateLimitError } from "@/lib/llm/groq";
import { PATH_EXTENSION_PROMPT, type ConceptGraphNode } from "@/lib/llm/prompts";

export const dynamic = "force-dynamic";

/** A prerequisite counts as satisfied at this mastery or above. */
const PREREQ_MASTERY_THRESHOLD = 0.6;
/** How many concepts one extension may add. */
const EXTENSION_MIN = 4;
const EXTENSION_MAX = 6;

export type PathItem = {
  concept_id: number;
  tier: string;
  why: string;
};

type LearnerExtensionRow = {
  goal: string | null;
  background: string | null;
  mastery: Record<string, number> | null;
  path: PathItem[] | null;
  current_concept: number | null;
};

type FeedbackRow = {
  pace: string | null;
  interests: string | null;
  notes: string | null;
};

const ExtensionItemSchema = z.object({
  concept_id: z.number().int(),
  tier: z.enum(["beginner", "intermediate", "advanced"]),
  why: z.string().min(1),
});

const ExtensionResponseSchema = z.object({
  path: z.array(ExtensionItemSchema).min(1).max(EXTENSION_MAX + 4),
});

type ExtensionItem = z.infer<typeof ExtensionItemSchema>;

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function asPath(value: unknown): PathItem[] {
  return Array.isArray(value) ? (value as PathItem[]) : [];
}

/**
 * Concepts the learner is ready for: every prerequisite already mastered
 * (mastery is keyed by slug, prerequisites by id) and not already on the
 * path. Ordered cheapest-first so the model can be nudged toward a
 * sensible ordering.
 */
export function computeFrontier(
  mastery: Record<string, number>,
  concepts: ConceptGraphNode[],
  currentPath: PathItem[]
): ConceptGraphNode[] {
  const idToSlug = new Map(concepts.map((node) => [node.id, node.slug]));
  const onPath = new Set(currentPath.map((item) => item.concept_id));

  return concepts
    .filter((node) => !onPath.has(node.id))
    .filter((node) =>
      node.prerequisites.every((prereqId) => {
        const slug = idToSlug.get(prereqId);
        // A prerequisite that is not in the graph cannot be judged mastered.
        if (!slug) return false;
        return (mastery[slug] ?? 0) >= PREREQ_MASTERY_THRESHOLD;
      })
    )
    .sort((a, b) => a.difficulty - b.difficulty || a.id - b.id);
}

export type ExtendPathResult = {
  ok: boolean;
  added: number;
  path: PathItem[];
  done: boolean;
  error?: string;
};

/** A just-recorded check-in signal, so a re-plan uses the freshest pace. */
export type ExtendPathSignal = {
  pace?: string | null;
};

/**
 * Shared by /api/extend-path and /api/feedback. Called whenever a learner asks
 * for more and after every check-in, so a new pace signal can bias tiers even
 * when the frontier has not grown.
 */
export async function extendPath(
  supabase: SupabaseClient,
  userId: string,
  signal: ExtendPathSignal = {}
): Promise<ExtendPathResult> {
  const { data: learnerRows, error: learnerError } = await supabase
    .from("learners")
    .select("goal, background, mastery, path, current_concept")
    .eq("user_id", userId)
    .limit(1)
    .returns<LearnerExtensionRow[]>();

  if (learnerError) {
    console.error("[extend-path] learner lookup failed:", learnerError.message);
    return {
      ok: false,
      added: 0,
      path: [],
      done: false,
      error: "learner not found",
    };
  }

  const learner = learnerRows?.[0];
  if (!learner) {
    return {
      ok: false,
      added: 0,
      path: [],
      done: false,
      error: "learner not found",
    };
  }

  const mastery = learner.mastery ?? {};
  const existingPath = asPath(learner.path);

  const { data: conceptRows, error: conceptError } = await supabase
    .from("concepts")
    .select("id, slug, title, difficulty, prerequisites")
    .order("difficulty", { ascending: true })
    .returns<ConceptGraphNode[]>();

  if (conceptError) {
    console.error("[extend-path] concept lookup failed:", conceptError.message);
    return {
      ok: false,
      added: 0,
      path: existingPath,
      done: false,
      error: "could not load curriculum",
    };
  }

  const concepts: ConceptGraphNode[] = conceptRows ?? [];
  const frontier = computeFrontier(mastery, concepts, existingPath);

  // Nothing left to unlock: the learner has finished the curriculum.
  if (frontier.length === 0) {
    return { ok: true, added: 0, path: existingPath, done: true };
  }

  // The most recent check-in steers the next batch, when there is one. The
  // caller may pass the pace it just recorded; otherwise the newest row wins.
  let feedback: FeedbackRow | null = null;
  {
    const { data: feedbackRows } = await supabase
      .from("feedback")
      .select("pace, interests, notes")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<FeedbackRow[]>();
    feedback = feedbackRows?.[0] ?? null;
  }
  if (signal.pace && feedback) {
    feedback = { ...feedback, pace: signal.pace };
  } else if (signal.pace && !feedback) {
    feedback = { pace: signal.pace, interests: null, notes: null };
  }

  let additions: ExtensionItem[] = [];
  try {
    // classifyResponse, not generateCompletion: same model, but temperature 0
    // and response_format json_object. Without json_object this reasoning model
    // can return an empty message.content on a long prompt.
    const raw = await classifyResponse(
      PATH_EXTENSION_PROMPT.system,
      PATH_EXTENSION_PROMPT.user({
        background: learner.background ?? "",
        goal: learner.goal ?? "",
        mastery,
        existing_path: existingPath,
        feedback: feedback
          ? {
              pace: feedback.pace,
              interests: feedback.interests,
              notes: feedback.notes,
            }
          : null,
        frontier: frontier.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          difficulty: c.difficulty,
          prerequisites: c.prerequisites,
        })),
      })
    );

    const parsed = ExtensionResponseSchema.safeParse(
      JSON.parse(stripFences(raw)) as unknown
    );

    if (parsed.success) {
      const frontierIds = new Set(frontier.map((c) => c.id));
      const seen = new Set(existingPath.map((item) => item.concept_id));
      const cleaned: ExtensionItem[] = [];
      for (const item of parsed.data.path) {
        // Only frontier concepts, never a duplicate, and cap the batch.
        if (!frontierIds.has(item.concept_id) || seen.has(item.concept_id)) {
          continue;
        }
        seen.add(item.concept_id);
        cleaned.push(item);
        if (cleaned.length >= EXTENSION_MAX) break;
      }
      additions = cleaned;
    } else {
      console.warn(
        "[extend-path] model output failed validation:",
        parsed.error.issues
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[extend-path] routing failed${isRateLimitError(err) ? " (rate limited)" : ""}: ${message}`
    );
  }

  // Deterministic fallback: the cheapest available concepts, so a failed or
  // unusable model call still extends the path.
  if (additions.length === 0) {
    const seen = new Set(existingPath.map((item) => item.concept_id));
    const fallback = frontier
      .filter((node) => !seen.has(node.id))
      .slice(0, EXTENSION_MIN)
      .map((node) => ({
        concept_id: node.id,
        tier: (mastery[node.slug] ?? 0) >= 0.7
          ? ("advanced" as const)
          : (mastery[node.slug] ?? 0) >= 0.4
            ? ("intermediate" as const)
            : ("beginner" as const),
        // Frontier concepts have their prerequisites met, so the useful thing
        // to say is what this one adds. Keyed on its own title so a fallback
        // batch does not read as one repeated line.
        why: `Nothing is standing between you and ${node.title} — its prerequisites are already met.`,
      }));
    additions = fallback;
  }

  if (additions.length === 0) {
    return { ok: true, added: 0, path: existingPath, done: true };
  }

  const updatedPath: PathItem[] = [...existingPath, ...additions];
  // A path can exist without a pointer to its first concept; repair it here
  // so the dashboard always has something to highlight.
  const currentConcept =
    typeof learner.current_concept === "number" && learner.current_concept > 0
      ? learner.current_concept
      : updatedPath[0]?.concept_id ?? null;

  const { error: updateError } = await supabase
    .from("learners")
    .update({
      path: updatedPath,
      current_concept: currentConcept,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error("[extend-path] learner update failed:", updateError.message);
    return {
      ok: false,
      added: 0,
      path: existingPath,
      done: false,
      error: "could not save path",
    };
  }

  return { ok: true, added: additions.length, path: updatedPath, done: false };
}

export async function POST() {
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

  const result = await extendPath(supabase, user.id);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "could not extend path" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    added: result.added,
    path: result.path,
    done: result.done,
  });
}
