import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  ConceptNoteContentSchemaV2,
  TimelineSchema,
  InteractionItemSchema,
} from "../lib/content-schema";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const TestSchema = z.array(InteractionItemSchema).length(5);

/**
 * Every content file is named `<slug>-<tier>.json` and its `tier` field must
 * agree. A mismatch is silent and destructive: the seed upserts on
 * (concept_id, tier), so a mislabeled file overwrites the other tier's rows
 * and leaves its intended tier empty. It happened once already
 * (embeddings-beginner.json declared "intermediate").
 */
const TIER_SUFFIX = /-(beginner|intermediate|advanced)\.json$/;

function expectedTierFromFilename(file: string): string | null {
  return TIER_SUFFIX.exec(file)?.[1] ?? null;
}

async function main() {
  const dir = path.join(process.cwd(), "content");
  if (!fs.existsSync(dir)) {
    console.error("content/ folder not found");
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("No JSON files in content/");
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  const seen = new Set<string>();

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw) as {
        concept_slug: string;
        tier: string;
        concept_note: unknown;
        timeline: unknown;
        test: unknown;
      };

      // Guard 1: tier field must match the filename suffix.
      const expectedTier = expectedTierFromFilename(file);
      if (expectedTier && data.tier !== expectedTier) {
        console.error(
          `[manual] SKIPPED ${file}: filename says tier "${expectedTier}" but the JSON says "${data.tier}". ` +
            `Fix the "tier" field to "${expectedTier}".`
        );
        failed++;
        continue;
      }

      // Guard 2: two files must not target the same (concept_slug, tier) row.
      const key = `${data.concept_slug}/${data.tier}`;
      if (seen.has(key)) {
        console.error(
          `[manual] SKIPPED ${file}: another file already seeded ${key}. ` +
            `Two files writing the same row means one silently overwrites the other.`
        );
        failed++;
        continue;
      }
      seen.add(key);

      // Look up concept id
      const { data: concept, error: conceptErr } = await supabase
        .from("concepts")
        .select("id")
        .eq("slug", data.concept_slug)
        .single();

      if (conceptErr || !concept) {
        console.error(`[manual] unknown concept: ${data.concept_slug}`);
        failed++;
        continue;
      }

      // Validate
      const noteValidated = ConceptNoteContentSchemaV2.parse(data.concept_note);
      const timelineValidated = TimelineSchema.parse(data.timeline);
      const testValidated = TestSchema.parse(data.test);

      // Upsert concept_notes
      const { error: noteErr } = await supabase.from("concept_notes").upsert(
        {
          concept_id: concept.id,
          tier: data.tier,
          ...noteValidated,
        },
        { onConflict: "concept_id,tier" }
      );
      if (noteErr) throw noteErr;

      // Upsert concept_timeline
      const { error: timelineErr } = await supabase
        .from("concept_timeline")
        .upsert(
          {
            concept_id: concept.id,
            tier: data.tier,
            timeline: timelineValidated,
          },
          { onConflict: "concept_id,tier" }
        );
      if (timelineErr) throw timelineErr;

      // Upsert concept_test
      const { error: testErr } = await supabase.from("concept_test").upsert(
        {
          concept_id: concept.id,
          tier: data.tier,
          questions: testValidated,
        },
        { onConflict: "concept_id,tier" }
      );
      if (testErr) throw testErr;

      console.log(`✓ ${data.concept_slug} / ${data.tier}`);
      ok++;
    } catch (err) {
      console.error(`[manual] ${file} FAILED:`, err);
      failed++;
    }
  }

  console.log(`[manual] wrote ${ok} / ${files.length}, failed ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
