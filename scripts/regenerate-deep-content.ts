import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  ConceptNoteContentSchemaV2,
  TimelineSchema,
  TestSchema,
  type ConceptNoteContentV2,
  type Timeline,
  type ConceptTest,
} from "../lib/content-schema";
import {
  CONTENT_GENERATION_PROMPT_V2,
  INTERACTION_TIMELINE_PROMPT,
  CONCEPT_TEST_PROMPT,
} from "../lib/llm/prompts";

type GroqModule = typeof import("../lib/llm/groq");

type ConceptNoteRow = {
  concept_id: number;
  tier: string;
  title: string;
  long_intro: string | null;
};

type ConceptSlugRow = {
  id: number;
  slug: string;
  title: string;
};

type TimelineRow = {
  concept_id: number;
  tier: string;
};

type TestRow = {
  concept_id: number;
  tier: string;
};

const GAP_MS = 20_000;
const RATE_LIMIT_WAIT_MS = 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[deep] Missing environment variable: ${name}`);
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

async function callModel(
  groq: GroqModule,
  label: string,
  system: string,
  user: string
): Promise<string> {
  try {
    return await groq.generateCompletion(system, user);
  } catch (err) {
    if (!groq.isRateLimitError(err)) throw err;
    console.warn(
      `[deep] ${label}: rate limited, sleeping 60s before one retry.`
    );
    await sleep(RATE_LIMIT_WAIT_MS);
    return await groq.generateCompletion(system, user);
  }
}

function parseV2(
  raw: string
):
  | { ok: true; value: ConceptNoteContentV2 }
  | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "response was not valid JSON" };
  }
  const parsed = ConceptNoteContentSchemaV2.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: `schema validation failed — ${issues}` };
  }
  return { ok: true, value: parsed.data };
}

function parseTimeline(
  raw: string
): { ok: true; value: Timeline } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "response was not valid JSON" };
  }
  const candidate =
    json &&
    typeof json === "object" &&
    "timeline" in json &&
    Array.isArray((json as { timeline: unknown }).timeline)
      ? (json as { timeline: unknown[] }).timeline
      : Array.isArray(json)
        ? json
        : null;
  if (!candidate) {
    return { ok: false, reason: "expected { timeline: [...] }" };
  }
  const parsed = TimelineSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: `timeline validation failed — ${issues}` };
  }
  return { ok: true, value: parsed.data };
}

function parseTest(
  raw: string
): { ok: true; value: ConceptTest } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, reason: "response was not valid JSON" };
  }
  const candidate =
    json &&
    typeof json === "object" &&
    "questions" in json
      ? json
      : Array.isArray(json)
        ? { questions: json }
        : null;
  if (!candidate) {
    return { ok: false, reason: "expected { questions: [...] }" };
  }
  const parsed = TestSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, reason: `test validation failed — ${issues}` };
  }
  return { ok: true, value: parsed.data };
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
    .select("concept_id, tier, title, long_intro")
    .returns<ConceptNoteRow[]>();

  if (notesError || !notes) {
    console.error("[deep] Could not read concept_notes:", notesError?.message);
    process.exit(1);
  }

  const { data: concepts } = await supabase
    .from("concepts")
    .select("id, slug, title")
    .returns<ConceptSlugRow[]>();

  const slugById = new Map((concepts ?? []).map((c) => [c.id, c]));

  const { data: existingTimelines } = await supabase
    .from("concept_timeline")
    .select("concept_id, tier")
    .returns<TimelineRow[]>();

  const { data: existingTests } = await supabase
    .from("concept_test")
    .select("concept_id, tier")
    .returns<TestRow[]>();

  const timelineKeys = new Set(
    (existingTimelines ?? []).map((r) => `${r.concept_id}:${r.tier}`)
  );
  const testKeys = new Set(
    (existingTests ?? []).map((r) => `${r.concept_id}:${r.tier}`)
  );

  const total = notes.length;
  let wrote = 0;
  let failed = 0;
  let isFirst = true;

  for (const note of notes) {
    const key = `${note.concept_id}:${note.tier}`;
    const concept = slugById.get(note.concept_id);
    const slug = concept?.slug ?? `concept-${note.concept_id}`;
    const label = `${slug} / ${note.tier}`;

    // Idempotent skip
    if (
      timelineKeys.has(key) &&
      testKeys.has(key) &&
      note.long_intro != null &&
      note.long_intro.length > 0
    ) {
      console.log(`[deep] skip ${label} (already complete)`);
      wrote += 1;
      continue;
    }

    if (!isFirst) {
      await sleep(GAP_MS);
    }
    isFirst = false;

    console.log(`[deep] generating ${label}...`);

    try {
      // 1. Deep content
      const baseUser = CONTENT_GENERATION_PROMPT_V2.user(
        concept?.title ?? note.title,
        slug,
        note.tier
      );

      let raw = await callModel(
        groq,
        label,
        CONTENT_GENERATION_PROMPT_V2.system,
        baseUser
      );
      let parsed = parseV2(raw);

      if (!parsed.ok) {
        console.warn(`[deep] ${label}: ${parsed.reason}. Retrying once.`);
        raw = await callModel(
          groq,
          label,
          CONTENT_GENERATION_PROMPT_V2.system,
          `${baseUser}\n\nReturn valid JSON matching the schema. No markdown fences.`
        );
        parsed = parseV2(raw);
      }

      if (!parsed.ok) {
        console.error(`[deep] ${label}: ${parsed.reason}. Skipping.`);
        failed += 1;
        continue;
      }

      const content = parsed.value;

      // Keep NOT NULL columns key_idea / universal_analogy satisfied
      const keyIdea =
        content.key_takeaways[0] ?? content.summary.slice(0, 120);
      const analogy =
        content.real_world_usage.slice(0, 200) ||
        content.long_intro.slice(0, 200);

      const { error: updateError } = await supabase
        .from("concept_notes")
        .update({
          title: content.title,
          summary: content.summary,
          learning_goals: content.learning_goals,
          long_intro: content.long_intro,
          deep_explanation: content.deep_explanation,
          formal_definition: content.formal_definition,
          code_example: content.code_example,
          common_mistakes: content.common_mistakes,
          real_world_usage: content.real_world_usage,
          key_takeaways: content.key_takeaways,
          estimated_minutes: content.estimated_minutes,
          key_idea: keyIdea,
          universal_analogy: analogy,
        })
        .eq("concept_id", note.concept_id)
        .eq("tier", note.tier);

      if (updateError) {
        console.error(
          `[deep] note update failed for ${label}:`,
          updateError.message
        );
        failed += 1;
        continue;
      }

      const noteJson = JSON.stringify(content);

      // 2. Timeline
      let timelineRaw = await callModel(
        groq,
        `${label} timeline`,
        INTERACTION_TIMELINE_PROMPT.system,
        INTERACTION_TIMELINE_PROMPT.user(noteJson)
      );
      let timelineParsed = parseTimeline(timelineRaw);

      if (!timelineParsed.ok) {
        console.warn(
          `[deep] ${label} timeline: ${timelineParsed.reason}. Retrying once.`
        );
        timelineRaw = await callModel(
          groq,
          `${label} timeline`,
          INTERACTION_TIMELINE_PROMPT.system,
          `${noteJson}\n\nReturn valid JSON matching the schema. No markdown fences.`
        );
        timelineParsed = parseTimeline(timelineRaw);
      }

      if (!timelineParsed.ok) {
        console.error(
          `[deep] ${label} timeline: ${timelineParsed.reason}. Skipping.`
        );
        failed += 1;
        continue;
      }

      const { error: timelineError } = await supabase
        .from("concept_timeline")
        .upsert(
          {
            concept_id: note.concept_id,
            tier: note.tier,
            timeline: timelineParsed.value,
          },
          { onConflict: "concept_id,tier" }
        );

      if (timelineError) {
        console.error(
          `[deep] timeline write failed for ${label}:`,
          timelineError.message
        );
        failed += 1;
        continue;
      }

      // 3. Test
      let testRaw = await callModel(
        groq,
        `${label} test`,
        CONCEPT_TEST_PROMPT.system,
        CONCEPT_TEST_PROMPT.user(noteJson)
      );
      let testParsed = parseTest(testRaw);

      if (!testParsed.ok) {
        console.warn(
          `[deep] ${label} test: ${testParsed.reason}. Retrying once.`
        );
        testRaw = await callModel(
          groq,
          `${label} test`,
          CONCEPT_TEST_PROMPT.system,
          `${noteJson}\n\nReturn valid JSON matching the schema. No markdown fences.`
        );
        testParsed = parseTest(testRaw);
      }

      if (!testParsed.ok) {
        console.error(
          `[deep] ${label} test: ${testParsed.reason}. Skipping.`
        );
        failed += 1;
        continue;
      }

      const { error: testError } = await supabase
        .from("concept_test")
        .upsert(
          {
            concept_id: note.concept_id,
            tier: note.tier,
            questions: testParsed.value.questions,
          },
          { onConflict: "concept_id,tier" }
        );

      if (testError) {
        console.error(
          `[deep] test write failed for ${label}:`,
          testError.message
        );
        failed += 1;
        continue;
      }

      console.log(`[deep] wrote ${label}`);
      wrote += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[deep] ${label} failed: ${message}`);
      failed += 1;
    }
  }

  console.log(`[deep] wrote ${wrote} / ${total}, failed ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error("[deep] Unexpected failure:", err);
  process.exit(1);
});
