import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  ConceptNoteContentSchema,
  type ConceptNoteContent,
} from "../lib/content-schema";
import { CONTENT_GENERATION_PROMPT } from "../lib/llm/prompts";

// lib/llm/groq.ts reads GROQ_API_KEY at module scope, so it is imported
// dynamically inside main() — after dotenv has populated process.env.
type GroqModule = typeof import("../lib/llm/groq");

type ConceptIdRow = {
  id: number;
  slug: string;
  title: string;
};

type ConceptNoteUpsertRow = {
  concept_id: number;
  tier: string;
  title: string;
  summary: string;
  learning_goals: string[];
  key_idea: string;
  universal_analogy: string;
  formal_definition: string | null;
  code_example: ConceptNoteContent["code_example"];
  common_mistakes: string[];
  estimated_minutes: number;
};

const TARGET_CONCEPTS = [
  "python-basics",
  "linear-algebra",
  "probability",
  "supervised-learning",
  "loss-functions",
  "gradient-descent",
  "overfitting",
  "neural-networks",
  "backprop",
  "embeddings",
  "tokenization",
  "prompt-engineering",
  "transformers-attention",
  "vector-db",
  "training-embeddings-with-gradient-descent",
  "using-embeddings-in-rag",
  "rag",
  "fine-tuning",
  "langchain-basics",
  "evaluation",
] as const;

const TIERS = ["beginner", "intermediate"] as const;

const GAP_MS = 20_000;
const RATE_LIMIT_WAIT_MS = 60_000;

const BEGINNER_RETRY_INSTRUCTION =
  "CRITICAL: beginner tier only. Code MUST use only variables, arithmetic (+ - * /), and print(). No loops. No functions. No imports. No built-ins. No comprehensions.";

const FORBIDDEN_BEGINNER_RULES: { label: string; pattern: RegExp }[] = [
  { label: "loop (for)", pattern: /\bfor\b/ },
  { label: "loop (while)", pattern: /\bwhile\b/ },
  { label: "function (def)", pattern: /\bdef\b/ },
  { label: "function (lambda)", pattern: /\blambda\b/ },
  { label: "import", pattern: /\bimport\b/ },
  {
    label: "built-in call",
    pattern: /\b(?:sum|ord|abs|len|min|max|range)\s*\(/,
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[content] Missing environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hasForbiddenBeginnerCode(code: string): string | null {
  for (const rule of FORBIDDEN_BEGINNER_RULES) {
    if (rule.pattern.test(code)) {
      return rule.label;
    }
  }
  return null;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function parseContent(
  raw: string
): { ok: true; value: ConceptNoteContent } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "response was not valid JSON" };
  }

  const parsed = ConceptNoteContentSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: `schema validation failed — ${issues}` };
  }

  return { ok: true, value: parsed.data };
}

/** One model call, with a single retry if Groq reports a rate limit. */
async function callModel(
  groq: GroqModule,
  label: string,
  user: string
): Promise<string> {
  try {
    return await groq.generateCompletion(
      CONTENT_GENERATION_PROMPT.system,
      user
    );
  } catch (err) {
    if (!groq.isRateLimitError(err)) throw err;
    console.warn(
      `[content] ${label}: rate limited, sleeping 60s before one retry.`
    );
    await sleep(RATE_LIMIT_WAIT_MS);
    return await groq.generateCompletion(CONTENT_GENERATION_PROMPT.system, user);
  }
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("GROQ_API_KEY");

  const groq: GroqModule = await import("../lib/llm/groq");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: concepts, error: conceptsError } = await supabase
    .from("concepts")
    .select("id, slug, title")
    .in("slug", [...TARGET_CONCEPTS])
    .returns<ConceptIdRow[]>();

  if (conceptsError) {
    console.error("[content] Could not read concepts:", conceptsError.message);
    process.exit(1);
  }

  const bySlug = new Map((concepts ?? []).map((c) => [c.slug, c]));
  const missing = TARGET_CONCEPTS.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    console.error(
      `[content] Missing concept rows for: ${missing.join(", ")}. Run \`npm run seed\` first.`
    );
    process.exit(1);
  }

  const total = TARGET_CONCEPTS.length * TIERS.length;
  let wrote = 0;
  let failed = 0;
  let isFirst = true;

  for (const slug of TARGET_CONCEPTS) {
    const concept = bySlug.get(slug);
    if (!concept) continue;

    for (const tier of TIERS) {
      const label = `${slug} / ${tier}`;

      if (!isFirst) {
        await sleep(GAP_MS);
      }
      isFirst = false;

      console.log(`[content] generating ${label}...`);

      try {
        const baseUser = CONTENT_GENERATION_PROMPT.user(
          concept.title,
          slug,
          tier
        );

        let raw = await callModel(groq, label, baseUser);
        let parsed = parseContent(raw);

        // One retry if the payload itself was unusable.
        if (!parsed.ok) {
          console.warn(
            `[content] ${label}: ${parsed.reason}. Retrying once.`
          );
          raw = await callModel(
            groq,
            label,
            `${baseUser}\n\nReturn ONLY the raw JSON object. Every field listed in the required shape must be present. No markdown fences.`
          );
          parsed = parseContent(raw);
        }

        if (!parsed.ok) {
          console.error(
            `[content] ${label}: ${parsed.reason}. Skipping.`
          );
          failed += 1;
          continue;
        }

        let content = parsed.value;

        if (tier === "beginner" && content.code_example) {
          const violation = hasForbiddenBeginnerCode(
            content.code_example.code
          );
          if (violation) {
            console.warn(
              `[content] beginner code violation: ${violation}. Retrying once.`
            );
            raw = await callModel(
              groq,
              label,
              `${baseUser}\n\n${BEGINNER_RETRY_INSTRUCTION}`
            );
            const retry = parseContent(raw);
            if (retry.ok) {
              if (tier === "beginner" && retry.value.code_example) {
                const retryViolation = hasForbiddenBeginnerCode(
                  retry.value.code_example.code
                );
                if (retryViolation) {
                  console.warn(
                    `[content] ${label}: beginner code still violates (${retryViolation}). Writing anyway.`
                  );
                }
              }
              content = retry.value;
            } else {
              console.warn(
                `[content] ${label}: retry unparseable (${retry.reason}). Writing the first attempt.`
              );
            }
          }
        }

        const row: ConceptNoteUpsertRow = {
          concept_id: concept.id,
          tier,
          title: content.title,
          summary: content.summary,
          learning_goals: content.learning_goals,
          key_idea: content.key_idea,
          universal_analogy: content.universal_analogy,
          formal_definition: content.formal_definition,
          code_example: content.code_example,
          common_mistakes: content.common_mistakes,
          estimated_minutes: content.estimated_minutes,
        };

        const { error: writeError } = await supabase
          .from("concept_notes")
          .upsert(row, { onConflict: "concept_id,tier" });

        if (writeError) {
          console.error(`[content] write failed for ${label}:`, writeError.message);
          failed += 1;
          continue;
        }

        console.log(`[content] wrote ${label}`);
        wrote += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[content] ${label} failed: ${message}`);
        failed += 1;
      }
    }
  }

  console.log(`[content] wrote ${wrote} / ${total}, failed ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error("[content] Unexpected failure:", err);
  process.exit(1);
});
