import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const DEMO_PASSWORD = "learnova2026";

type Comfort = { math: number; code: number; theory: number };

type PathSpec = { slug: string; tier: "beginner" | "intermediate" | "advanced" };

type Persona = {
  email: string;
  name: string;
  goal: string;
  background: string;
  comfort: Comfort;
  path: PathSpec[];
  /** Slugs the learner has already finished, at the tier they ran them. */
  completed: { slug: string; tier: string }[];
  currentSlug: string;
  mastery: Record<string, number>;
  sparks: number;
  currentStreak: number;
  longestStreak: number;
  badges: string[];
};

const PERSONAS: Persona[] = [
  {
    email: "priya.demo@learnova.test",
    name: "Priya Sharma",
    goal: "Use AI in my research",
    background: "Chemistry",
    comfort: { math: 0.6, code: 0.2, theory: 0.75 },
    path: [
      { slug: "python-basics", tier: "beginner" },
      { slug: "linear-algebra", tier: "beginner" },
      { slug: "probability", tier: "beginner" },
      { slug: "supervised-learning", tier: "intermediate" },
      { slug: "gradient-descent", tier: "intermediate" },
      { slug: "embeddings", tier: "intermediate" },
      { slug: "transformers-attention", tier: "intermediate" },
      { slug: "fine-tuning", tier: "intermediate" },
    ],
    completed: [
      { slug: "python-basics", tier: "beginner" },
      { slug: "linear-algebra", tier: "beginner" },
    ],
    currentSlug: "probability",
    mastery: { "python-basics": 0.82, "linear-algebra": 0.78 },
    sparks: 145,
    currentStreak: 3,
    longestStreak: 5,
    badges: ["first_steps", "explorer"],
  },
  {
    email: "rahul.demo@learnova.test",
    name: "Rahul Verma",
    goal: "Understand transformers",
    background: "Engineering",
    comfort: { math: 0.7, code: 0.8, theory: 0.5 },
    path: [
      { slug: "python-basics", tier: "intermediate" },
      { slug: "gradient-descent", tier: "intermediate" },
      { slug: "neural-networks", tier: "intermediate" },
      { slug: "backprop", tier: "intermediate" },
      { slug: "transformers-attention", tier: "intermediate" },
      { slug: "embeddings", tier: "intermediate" },
      { slug: "fine-tuning", tier: "intermediate" },
      { slug: "evaluation", tier: "intermediate" },
    ],
    completed: [
      { slug: "python-basics", tier: "intermediate" },
      { slug: "gradient-descent", tier: "intermediate" },
      { slug: "neural-networks", tier: "intermediate" },
      { slug: "backprop", tier: "intermediate" },
    ],
    currentSlug: "transformers-attention",
    mastery: {
      "python-basics": 0.92,
      "gradient-descent": 0.88,
      "neural-networks": 0.85,
      backprop: 0.72,
    },
    sparks: 420,
    currentStreak: 7,
    longestStreak: 7,
    badges: ["first_steps", "explorer", "deep_diver", "perfect"],
  },
  {
    email: "aisha.demo@learnova.test",
    name: "Aisha Khan",
    goal: "Build a RAG app for my startup",
    background: "Business",
    comfort: { math: 0.4, code: 0.3, theory: 0.6 },
    path: [
      { slug: "python-basics", tier: "beginner" },
      { slug: "prompt-engineering", tier: "beginner" },
      { slug: "embeddings", tier: "intermediate" },
      { slug: "using-embeddings-in-rag", tier: "intermediate" },
      { slug: "rag", tier: "intermediate" },
      { slug: "vector-db", tier: "intermediate" },
      {
        slug: "training-embeddings-with-gradient-descent",
        tier: "intermediate",
      },
      { slug: "evaluation", tier: "intermediate" },
    ],
    completed: [
      { slug: "python-basics", tier: "beginner" },
      { slug: "prompt-engineering", tier: "beginner" },
      { slug: "embeddings", tier: "intermediate" },
    ],
    currentSlug: "using-embeddings-in-rag",
    mastery: {
      "python-basics": 0.75,
      "prompt-engineering": 0.82,
      embeddings: 0.71,
    },
    sparks: 260,
    currentStreak: 2,
    longestStreak: 4,
    badges: ["first_steps", "explorer", "pythonista"],
  },
];

/** One line per path step, in the voice the learner would recognise. */
const WHY: Record<string, string> = {
  "python-basics": "The language everything else is written in.",
  "linear-algebra": "Vectors and matrices are how models hold data.",
  probability: "Uncertainty is what makes predictions useful.",
  "supervised-learning": "The first pattern-matching workflow worth building.",
  "gradient-descent": "How a model actually learns from its mistakes.",
  "neural-networks": "Layers, activations, and the forward pass.",
  backprop: "How an error signal travels back to every weight.",
  embeddings: "Meaning as coordinates you can compute with.",
  "prompt-engineering": "Steering a model without touching its weights.",
  "transformers-attention": "The architecture behind modern language models.",
  "using-embeddings-in-rag": "Retrieval and generation working together.",
  rag: "Ground answers in your own documents.",
  "vector-db": "Fast similarity search at scale.",
  "training-embeddings-with-gradient-descent":
    "Teaching the embedding space the shape you need.",
  "fine-tuning": "Specialising a pretrained model on your own data.",
  evaluation: "Knowing whether any of this worked.",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Finds an auth user by email. The admin API has no getUserByEmail, so the
 * list is paged through until the address turns up.
 */
async function findUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (hit) return hit.id;
    if (users.length < perPage) return null;
  }
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: concepts, error: conceptsError } = await supabase
    .from("concepts")
    .select("id, slug");
  if (conceptsError) {
    throw new Error(`concept lookup failed: ${conceptsError.message}`);
  }

  const idBySlug = new Map((concepts ?? []).map((c) => [c.slug, c.id]));

  // Fail loudly rather than writing a path that points at nothing: a missing
  // concept_id silently renders as an empty roadmap card.
  for (const persona of PERSONAS) {
    const referenced = [
      ...persona.path.map((p) => p.slug),
      ...persona.completed.map((c) => c.slug),
      persona.currentSlug,
    ];
    const missing = Array.from(new Set(referenced)).filter(
      (s) => !idBySlug.has(s)
    );
    if (missing.length) {
      throw new Error(
        `${persona.name}: unknown concept slug(s): ${missing.join(", ")}`
      );
    }
  }

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const nowIso = new Date().toISOString();

  for (const persona of PERSONAS) {
    try {
      const existingId = await findUserByEmail(supabase, persona.email);
      if (existingId) {
        skipped.push(persona.email);
        console.log(`- skipped ${persona.name} (${persona.email} already exists)`);
        continue;
      }

      const { data: created_, error: createError } =
        await supabase.auth.admin.createUser({
          email: persona.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
        });
      if (createError) {
        throw new Error(`createUser failed: ${createError.message}`);
      }
      const userId = created_.user?.id;
      if (!userId) throw new Error("createUser returned no user id");

      // Migration 001 puts a trigger on auth.users that inserts the learner
      // row, so this is an update. An insert here would collide on the
      // user_id primary key.
      const { data: learnerRows, error: learnerError } = await supabase
        .from("learners")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1);
      if (learnerError) {
        throw new Error(`learner lookup failed: ${learnerError.message}`);
      }
      if (!learnerRows?.[0]) {
        throw new Error(
          "no learner row was created by the signup trigger — check that the " +
            "on_auth_user_created trigger from migration 001 is installed"
        );
      }

      const completion: Record<string, string> = {};
      for (const done of persona.completed) {
        // Same key the app writes: `${concept_id}:${tier}`.
        completion[`${idBySlug.get(done.slug)}:${done.tier}`] = nowIso;
      }

      const payload: Record<string, unknown> = {
        learner_name: persona.name,
        goal: persona.goal,
        background: persona.background,
        comfort: persona.comfort,
        path: persona.path.map((p) => ({
          concept_id: idBySlug.get(p.slug),
          tier: p.tier,
          why: WHY[p.slug] ?? `Next step toward ${persona.goal.toLowerCase()}.`,
        })),
        current_concept: idBySlug.get(persona.currentSlug),
        mastery: persona.mastery,
        sparks: persona.sparks,
        current_streak: persona.currentStreak,
        longest_streak: persona.longestStreak,
        last_active_date: today(),
        badges: persona.badges,
        concept_completed_at: completion,
        updated_at: nowIso,
      };

      const { error: updateError } = await supabase
        .from("learners")
        .update(payload)
        .eq("user_id", userId);
      if (updateError) {
        throw new Error(`learner update failed: ${updateError.message}`);
      }

      created.push(persona.email);
      console.log(`✓ created ${persona.name} (${persona.email})`);
    } catch (err) {
      failed.push(persona.email);
      console.error(
        `✗ ${persona.name} (${persona.email}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  console.log("");
  if (created.length || skipped.length) {
    console.log(
      `Seeded ${created.length + skipped.length} personas (${
        created.length
      } created, ${skipped.length} skipped, ${failed.length} failed).`
    );
  }
  if (failed.length) {
    console.error(`Failed: ${failed.join(", ")}`);
  }
  console.log("Sign in with:");
  for (const persona of PERSONAS) {
    const mark = created.includes(persona.email)
      ? "✓"
      : skipped.includes(persona.email)
        ? "-"
        : "✗";
    console.log(`  ${mark} ${persona.email} / ${DEMO_PASSWORD}`);
  }

  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
