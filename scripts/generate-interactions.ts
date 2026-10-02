import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  InteractionSequenceSchema,
  type InteractionSequence,
} from "../lib/content-schema";
import { INTERACTION_GEN_PROMPT } from "../lib/llm/prompts";

// lib/llm/groq.ts reads GROQ_API_KEY at module scope, so it is imported
// dynamically inside main() — after dotenv has populated process.env.
type GroqModule = typeof import("../lib/llm/groq");

type ConceptNoteRow = {
  concept_id: number;
  tier: string;
  title: string;
  summary: string;
  key_idea: string;
  universal_analogy: string;
  formal_definition: string | null;
  code_example: unknown;
  common_mistakes: string[] | null;
};

type ConceptSlugRow = {
  id: number;
  slug: string;
};

const GAP_MS = 20_000;
const RATE_LIMIT_WAIT_MS = 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[interactions] Missing environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function parseSequence(
  raw: string
): { ok: true; value: InteractionSequence } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "response was not valid JSON" };
  }

  // Accept either a bare array or { sequence: [...] }
  const candidate = Array.isArray(json)
    ? json
    : json &&
        typeof json === "object" &&
        "sequence" in json &&
        Array.isArray((json as { sequence: unknown }).sequence)
      ? (json as { sequence: unknown[] }).sequence
      : null;

  if (!candidate) {
    return { ok: false, reason: "expected a JSON array of interaction items" };
  }

  const parsed = InteractionSequenceSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: `schema validation failed — ${issues}` };
  }

  return { ok: true, value: parsed.data };
}

async function callModel(
  groq: GroqModule,
  label: string,
  user: string
): Promise<string> {
  try {
    return await groq.generateCompletion(
      INTERACTION_GEN_PROMPT.system,
      user
    );
  } catch (err) {
    if (!groq.isRateLimitError(err)) throw err;
    console.warn(
      `[interactions] ${label}: rate limited, sleeping 60s before one retry.`
    );
    await sleep(RATE_LIMIT_WAIT_MS);
    return await groq.generateCompletion(
      INTERACTION_GEN_PROMPT.system,
      user
    );
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

  const { data: notes, error: notesError } = await supabase
    .from("concept_notes")
    .select(
      "concept_id, tier, title, summary, key_idea, universal_analogy, formal_definition, code_example, common_mistakes"
    )
    .returns<ConceptNoteRow[]>();

  if (notesError) {
    console.error(
      "[interactions] Could not read concept_notes:",
      notesError.message
    );
    process.exit(1);
  }

  if (!notes || notes.length === 0) {
    console.error(
      "[interactions] No concept_notes rows. Run `npm run seed:content` first."
    );
    process.exit(1);
  }

  const conceptIds = Array.from(new Set(notes.map((n) => n.concept_id)));
  const { data: concepts, error: conceptsError } = await supabase
    .from("concepts")
    .select("id, slug")
    .in("id", conceptIds)
    .returns<ConceptSlugRow[]>();

  if (conceptsError) {
    console.error(
      "[interactions] Could not read concepts:",
      conceptsError.message
    );
    process.exit(1);
  }

  const slugById = new Map((concepts ?? []).map((c) => [c.id, c.slug]));

  const { data: existing } = await supabase
    .from("concept_interactions")
    .select("concept_id, tier")
    .returns<{ concept_id: number; tier: string }[]>();

  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.concept_id}:${r.tier}`)
  );

  let wrote = 0;
  let failed = 0;
  let skipped = 0;
  let isFirst = true;

  for (const note of notes) {
    const key = `${note.concept_id}:${note.tier}`;
    const slug = slugById.get(note.concept_id) ?? `id-${note.concept_id}`;
    const label = `${slug} / ${note.tier}`;

    if (existingKeys.has(key)) {
      console.log(`[interactions] skip ${label} (already exists)`);
      skipped += 1;
      continue;
    }

    if (!isFirst) {
      await sleep(GAP_MS);
    }
    isFirst = false;

    console.log(`[interactions] generating ${label}...`);

    const noteJson = JSON.stringify({
      title: note.title,
      summary: note.summary,
      key_idea: note.key_idea,
      universal_analogy: note.universal_analogy,
      formal_definition: note.formal_definition,
      code_example: note.code_example,
      common_mistakes: note.common_mistakes ?? [],
      tier: note.tier,
    });

    try {
      const baseUser = INTERACTION_GEN_PROMPT.user(noteJson);
      let raw = await callModel(groq, label, baseUser);
      let parsed = parseSequence(raw);

      if (!parsed.ok) {
        console.warn(
          `[interactions] ${label}: ${parsed.reason}. Retrying once.`
        );
        raw = await callModel(
          groq,
          label,
          `${baseUser}\n\nCRITICAL: Return ONLY a JSON array of EXACTLY 6 interaction items. Each item must have a valid type (fill_blank, drag_match, order_steps, predict, spot_mistake, explain) with all required fields. No markdown fences. No wrapper object.`
        );
        parsed = parseSequence(raw);
      }

      if (!parsed.ok) {
        console.error(`[interactions] ${label}: ${parsed.reason}. Skipping.`);
        failed += 1;
        continue;
      }

      const { error: upsertError } = await supabase
        .from("concept_interactions")
        .upsert(
          {
            concept_id: note.concept_id,
            tier: note.tier,
            sequence: parsed.value,
          },
          { onConflict: "concept_id,tier" }
        );

      if (upsertError) {
        console.error(
          `[interactions] ${label}: upsert failed — ${upsertError.message}`
        );
        failed += 1;
        continue;
      }

      console.log(`[interactions] wrote ${label}`);
      wrote += 1;
      existingKeys.add(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[interactions] ${label}: ${message}`);
      failed += 1;
    }
  }

  console.log(
    `[interactions] wrote ${wrote} / ${notes.length}, failed ${failed}, skipped ${skipped}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[interactions] unexpected failure:", err);
  process.exit(1);
});
