import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  classifyResponse,
  isRateLimitError,
} from "@/lib/llm/groq";
import {
  DIAGNOSE_PROMPT,
  PATH_ROUTING_PROMPT,
  type ConceptGraphNode,
} from "@/lib/llm/prompts";
import { masteryToTier } from "@/lib/tier";

export const dynamic = "force-dynamic";

const MASTERY_THRESHOLD = 0.6;
/** The initial path is deliberately long: learners used to hit a dead end. */
const PATH_MIN = 8;
const PATH_MAX = 12;
const FALLBACK_PATH_LENGTH = 8;

const AnswerSchema = z.object({
  concept_slug: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
});

const OnboardBodySchema = z.object({
  background: z.string(),
  /** Optional: blank means the email local part is used everywhere instead. */
  name: z.string().trim().max(80).optional().default(""),
  goal: z.string().min(1),
  role_title: z.string(),
  answers: z.array(AnswerSchema).min(1).max(5),
});

const GradedSchema = z.object({
  score: z.number(),
  correct: z.boolean(),
  reason: z.string(),
});

const PathItemSchema = z.object({
  concept_id: z.number().int(),
  tier: z.enum(["beginner", "intermediate", "advanced"]),
  why: z.string().min(1),
});

const PathResponseSchema = z.object({
  path: z.array(PathItemSchema).min(PATH_MIN).max(PATH_MAX),
});

type PathItem = z.infer<typeof PathItemSchema>;

type LearnerExisting = {
  goal: string | null;
  path: PathItem[] | null;
  profile_version: number;
};

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

/**
 * Deterministic path used when the model output is unusable. Takes the
 * frontier first (concepts whose prerequisites are all mastered), ordered by
 * difficulty, then tops the list up to FALLBACK_PATH_LENGTH with the
 * remaining concepts — again cheapest-first, and never ahead of a
 * prerequisite that is not already in the path.
 */
function buildFallbackPath(
  graph: ConceptGraphNode[],
  mastery: Record<string, number>
): PathItem[] {
  const idToSlug = new Map(graph.map((node) => [node.id, node.slug]));

  const masteredIds = new Set(
    graph
      .filter((node) => {
        const slug = idToSlug.get(node.id);
        return slug ? (mastery[slug] ?? 0) >= MASTERY_THRESHOLD : false;
      })
      .map((node) => node.id)
  );

  const byDifficulty = (a: ConceptGraphNode, b: ConceptGraphNode) =>
    a.difficulty - b.difficulty || a.id - b.id;

  const chosen: ConceptGraphNode[] = [];
  const chosenIds = new Set<number>();

  const take = (node: ConceptGraphNode) => {
    chosen.push(node);
    chosenIds.add(node.id);
  };

  // 1. Everything already unlocked, easiest first.
  for (const node of graph.filter((n) => !chosenIds.has(n.id)).sort(byDifficulty)) {
    if (chosen.length >= FALLBACK_PATH_LENGTH) break;
    if (node.prerequisites.every((prereqId) => masteredIds.has(prereqId))) {
      take(node);
    }
  }

  // 2. Top up from the rest of the graph, still respecting prerequisites.
  //    Repeated passes because taking a node can unlock its dependants.
  let grew = true;
  while (chosen.length < FALLBACK_PATH_LENGTH && grew) {
    grew = false;
    for (const node of graph.filter((n) => !chosenIds.has(n.id)).sort(byDifficulty)) {
      if (chosen.length >= FALLBACK_PATH_LENGTH) break;
      if (
        node.prerequisites.every(
          (prereqId) => masteredIds.has(prereqId) || chosenIds.has(prereqId)
        )
      ) {
        take(node);
        grew = true;
      }
    }
  }

  const idToTitle = new Map(graph.map((node) => [node.id, node.title]));

  return chosen.map((node) => {
    const slug = idToSlug.get(node.id);
    // Naming this concept's own unmet prerequisites is what makes two cards on
    // the same path read differently. One shared sentence repeated down the
    // page tells the learner nothing.
    const unmet = node.prerequisites
      .filter((prereqId) => !masteredIds.has(prereqId))
      .map((prereqId) => idToTitle.get(prereqId))
      .filter((title): title is string => Boolean(title));

    return {
      concept_id: node.id,
      tier: masteryToTier(slug ? mastery[slug] : undefined),
      why:
        unmet.length > 0
          ? `Builds on ${unmet.slice(0, 2).join(" and ")}, so it comes after ${
              unmet.length === 1 ? "it" : "them"
            }.`
          : `Everything ${node.title} depends on is already mastered — start here.`,
    };
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Validate body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const bodyResult = OnboardBodySchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          issues: bodyResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { background, name, goal, role_title, answers } = bodyResult.data;

    // 3. Already onboarded? Skip AI and return existing path.
    const { data: existingRows } = await supabase
      .from("learners")
      .select("goal, path, profile_version")
      .eq("user_id", user.id)
      .limit(1)
      .returns<LearnerExisting[]>();

    const existing = existingRows?.[0] ?? null;
    if (existing?.goal) {
      const path = Array.isArray(existing.path) ? existing.path : [];
      return NextResponse.json({
        ok: true,
        path,
        alreadyOnboarded: true,
      });
    }

    // 4. Grade the diagnostic answers in parallel. Failure → score 0.5.
    const graded = await Promise.all(
      answers.map(async (answer) => {
        if (answer.answer.trim() === "") {
          return { slug: answer.concept_slug, score: 0.5 };
        }
        try {
          const raw = await classifyResponse(
            DIAGNOSE_PROMPT.system,
            DIAGNOSE_PROMPT.user(answer.question, answer.answer)
          );
          const parsed = GradedSchema.safeParse(
            JSON.parse(stripFences(raw)) as unknown
          );
          if (!parsed.success) {
            console.error(
              `[onboard] grading output invalid for ${answer.concept_slug}:`,
              parsed.error.issues
            );
            return { slug: answer.concept_slug, score: 0.5 };
          }
          return {
            slug: answer.concept_slug,
            score: clampScore(parsed.data.score),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[onboard] grading failed for ${answer.concept_slug}: ${message}`
          );
          return { slug: answer.concept_slug, score: 0.5 };
        }
      })
    );

    // 5. Mastery map
    const mastery: Record<string, number> = {};
    for (const item of graded) {
      mastery[item.slug] = item.score;
    }

    // 6. Full concept graph
    const { data: graphRows, error: graphError } = await supabase
      .from("concepts")
      .select("id, slug, title, difficulty, prerequisites")
      .order("difficulty", { ascending: true })
      .returns<ConceptGraphNode[]>();

    if (graphError) {
      console.error("[onboard] could not read concept graph:", graphError.message);
      return NextResponse.json(
        { error: "Could not load curriculum" },
        { status: 500 }
      );
    }

    const graph: ConceptGraphNode[] = graphRows ?? [];

    // 7. Route path with fast model (no lesson generation).
    //
    // Uses classifyResponse rather than generateCompletion: it is the same
    // model, but pins temperature to 0 and sets response_format to json_object.
    // Without json_object this reasoning model came back with an empty
    // `message.content` on a long routing prompt, which is indistinguishable
    // from a crash and cost the learner the whole routing pass.
    let path: PathItem[] | null = null;

    try {
      const raw = await classifyResponse(
        PATH_ROUTING_PROMPT.system,
        PATH_ROUTING_PROMPT.user({
          background,
          goal,
          mastery,
          concepts: graph.map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            difficulty: c.difficulty,
            prerequisites: c.prerequisites,
          })),
        })
      );
      const parsed = PathResponseSchema.safeParse(
        JSON.parse(stripFences(raw)) as unknown
      );

      if (parsed.success) {
        const validIds = new Set(graph.map((node) => node.id));
        const seen = new Set<number>();
        const cleaned: PathItem[] = [];
        for (const item of parsed.data.path) {
          if (!validIds.has(item.concept_id) || seen.has(item.concept_id)) {
            continue;
          }
          seen.add(item.concept_id);
          cleaned.push(item);
        }
        if (cleaned.length >= PATH_MIN) {
          path = cleaned;
        } else {
          console.warn(
            `[onboard] generated path had ${cleaned.length} usable items, falling back.`
          );
        }
      } else {
        console.warn(
          "[onboard] path output failed validation:",
          parsed.error.issues
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[onboard] path routing failed${isRateLimitError(err) ? " (rate limited)" : ""}: ${message}`
      );
    }

    // 8. Fallback
    if (!path) {
      path = buildFallbackPath(graph, mastery);
    }

    if (path.length === 0) {
      return NextResponse.json(
        { error: "Curriculum is empty — run the seed script first" },
        { status: 500 }
      );
    }

    // 9. Upsert learner (routing only — no lesson content)
    const profileVersion = (existing?.profile_version ?? 0) + 1;

    const { error: upsertError } = await supabase.from("learners").upsert(
      {
        user_id: user.id,
        goal,
        background,
        // Null rather than "" so the email-prefix fallback applies. The column's
        // check constraint rejects a whitespace-only value too.
        learner_name: name.length > 0 ? name : null,
        role_title,
        mastery,
        path,
        current_concept: path[0].concept_id,
        profile_version: profileVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("[onboard] learner upsert failed:", upsertError.message);
      return NextResponse.json(
        { error: "Could not save your profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[onboard] unexpected failure:", message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
