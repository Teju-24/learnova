import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

type ConceptSeed = {
  slug: string;
  title: string;
  difficulty: number;
  prerequisites: string[];
};

type ConceptIdRow = {
  id: number;
  slug: string;
};

type ConceptUpsertRow = {
  slug: string;
  title: string;
  difficulty: number;
  prerequisites: number[];
};

const CURRICULUM: ConceptSeed[] = [
  { slug: "python-basics", title: "Python Basics", difficulty: 1, prerequisites: [] },
  { slug: "linear-algebra", title: "Linear Algebra", difficulty: 1, prerequisites: [] },
  { slug: "probability", title: "Probability", difficulty: 1, prerequisites: [] },
  { slug: "supervised-learning", title: "Supervised Learning", difficulty: 2, prerequisites: ["python-basics", "probability"] },
  { slug: "loss-functions", title: "Loss Functions", difficulty: 2, prerequisites: ["supervised-learning"] },
  { slug: "gradient-descent", title: "Gradient Descent", difficulty: 2, prerequisites: ["loss-functions", "linear-algebra"] },
  { slug: "overfitting", title: "Overfitting", difficulty: 3, prerequisites: ["supervised-learning"] },
  { slug: "neural-networks", title: "Neural Networks", difficulty: 3, prerequisites: ["gradient-descent"] },
  { slug: "backprop", title: "Backpropagation", difficulty: 3, prerequisites: ["neural-networks"] },
  { slug: "embeddings", title: "What Are Embeddings?", difficulty: 3, prerequisites: ["linear-algebra"] },
  { slug: "tokenization", title: "Tokenization", difficulty: 3, prerequisites: ["python-basics"] },
  { slug: "prompt-engineering", title: "Prompt Engineering", difficulty: 2, prerequisites: ["tokenization"] },
  { slug: "transformers-attention", title: "Transformers and Attention", difficulty: 4, prerequisites: ["backprop"] },
  { slug: "vector-db", title: "Vector Databases", difficulty: 4, prerequisites: ["embeddings"] },
  { slug: "training-embeddings-with-gradient-descent", title: "Training Embeddings with Gradient Descent", difficulty: 4, prerequisites: ["embeddings", "gradient-descent"] },
  { slug: "using-embeddings-in-rag", title: "Using Embeddings in a RAG App", difficulty: 4, prerequisites: ["training-embeddings-with-gradient-descent"] },
  { slug: "rag", title: "Retrieval-Augmented Generation", difficulty: 4, prerequisites: ["using-embeddings-in-rag", "prompt-engineering"] },
  { slug: "fine-tuning", title: "Fine-tuning", difficulty: 5, prerequisites: ["transformers-attention"] },
  { slug: "langchain-basics", title: "LangChain Basics", difficulty: 3, prerequisites: ["python-basics", "prompt-engineering"] },
  { slug: "evaluation", title: "Evaluating AI Systems", difficulty: 4, prerequisites: ["supervised-learning"] },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[seed] Missing environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Seeding ${CURRICULUM.length} concepts...`);

  // Pass 1: insert every concept with an empty prerequisites array so that
  // ids exist before we try to resolve slugs into numeric ids.
  const passOne: ConceptUpsertRow[] = CURRICULUM.map((c) => ({
    slug: c.slug,
    title: c.title,
    difficulty: c.difficulty,
    prerequisites: [],
  }));

  const { error: passOneError } = await supabase
    .from("concepts")
    .upsert(passOne, { onConflict: "slug" });

  if (passOneError) {
    console.error("[seed] Pass 1 failed:", passOneError.message);
    process.exit(1);
  }

  // Pass 2: read back id + slug, build the slug -> id map, then resolve
  // each concept's prerequisite slugs into numeric ids.
  const { data: rows, error: readError } = await supabase
    .from("concepts")
    .select("id, slug")
    .returns<ConceptIdRow[]>();

  if (readError) {
    console.error("[seed] Could not read concepts back:", readError.message);
    process.exit(1);
  }

  const slugToId = new Map<string, number>();
  for (const row of rows ?? []) {
    slugToId.set(row.slug, row.id);
  }

  const missing = CURRICULUM.filter((c) => !slugToId.has(c.slug)).map(
    (c) => c.slug
  );
  if (missing.length > 0) {
    console.error("[seed] Missing ids for slugs:", missing.join(", "));
    process.exit(1);
  }

  for (const concept of CURRICULUM) {
    const prerequisites: number[] = [];
    for (const prereqSlug of concept.prerequisites) {
      const prereqId = slugToId.get(prereqSlug);
      if (prereqId === undefined) {
        console.error(
          `[seed] Unknown prerequisite "${prereqSlug}" for ${concept.slug}`
        );
        process.exit(1);
      }
      prerequisites.push(prereqId);
    }

    const { error: updateError } = await supabase
      .from("concepts")
      .update({ prerequisites })
      .eq("slug", concept.slug);

    if (updateError) {
      console.error(
        `[seed] Failed to set prerequisites for ${concept.slug}:`,
        updateError.message
      );
      process.exit(1);
    }
  }

  console.log(`Done. Seeded ${CURRICULUM.length} concepts with prerequisites resolved.`);
}

main().catch((err: unknown) => {
  console.error("[seed] Unexpected failure:", err);
  process.exit(1);
});
