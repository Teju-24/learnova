import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ChevronLeft, Clock, Flame, Sparkles } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import MasteryRing from "@/components/MasteryRing";
import { Container } from "@/components/Container";
import LessonPlayer, {
  type ConceptNoteForPlayer,
} from "@/components/LessonPlayer";
import { createClient } from "@/lib/supabase/server";
import { resolveTier, tierFallbackChain, tierLabel } from "@/lib/tier";
import {
  TimelineSchema,
  TestSchema,
  InteractionItemSchema,
  type Timeline,
  type ConceptTest,
  type InteractionItem,
} from "@/lib/content-schema";
import type { InitialReview, TestVerdict } from "@/components/LessonPlayer";

type PathItem = {
  concept_id: number;
  tier: string;
  why: string;
};

type LessonProgressEntry = {
  last_step?: unknown;
  completed_at?: unknown;
};

type WeaknessEntry = {
  weak_sections?: unknown;
  review_step?: unknown;
};

type StoredTestReview = {
  questions?: unknown;
  answers?: unknown;
  verdicts?: unknown;
  reasons?: unknown;
  submitted_at?: unknown;
};

type LearnerRow = {
  background: string | null;
  goal: string | null;
  mastery: Record<string, number> | null;
  path: PathItem[];
  current_concept: number | null;
  current_streak: number | null;
  sparks: number | null;
  badges: string[] | null;
  lesson_progress: Record<string, LessonProgressEntry> | null;
  weakness_sections: Record<string, WeaknessEntry> | null;
  test_reviews: Record<string, StoredTestReview> | null;
};

type ConceptRow = {
  id: number;
  slug: string;
  title: string;
};

type NoteRow = {
  title: string;
  summary: string;
  long_intro: string | null;
  deep_explanation: ConceptNoteForPlayer["deep_explanation"];
  formal_definition: string | null;
  code_example: ConceptNoteForPlayer["code_example"];
  common_mistakes: string[] | null;
  real_world_usage: string | null;
  key_takeaways: string[] | null;
  key_idea: string | null;
  universal_analogy: string | null;
};

type PageProps = {
  params: { conceptId: string };
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function asVerdict(value: unknown): TestVerdict {
  return value === "correct" || value === "partial" ? value : "wrong";
}

/** Rebuilds the stored answer key so the player can show the full review. */
function parseTestReview(stored: StoredTestReview | null | undefined) {
  if (!stored) return undefined;

  const questionsParsed = z.array(InteractionItemSchema).safeParse(
    stored.questions
  );
  const rawAnswers = Array.isArray(stored.answers) ? stored.answers : [];
  const rawVerdicts = asStringArray(stored.verdicts);
  const reasons = asStringArray(stored.reasons);
  const count = questionsParsed.success ? questionsParsed.data.length : 0;

  return {
    questions: questionsParsed.success ? questionsParsed.data : [],
    answers: Array.from({ length: count }, (_, i) => {
      const entry = rawAnswers[i];
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as {
              userAnswer?: unknown;
              correct?: unknown;
            })
          : {};
      return {
        index: i,
        userAnswer:
          typeof record.userAnswer === "string" ? record.userAnswer : "",
        correct: record.correct === true,
      };
    }),
    verdicts: Array.from({ length: count }, (_, i) => asVerdict(rawVerdicts[i])),
    reasons: Array.from({ length: count }, (_, i) => reasons[i] ?? ""),
    submitted_at:
      typeof stored.submitted_at === "string" ? stored.submitted_at : undefined,
  };
}

export default async function LessonPage({ params }: PageProps) {
  const conceptId = Number.parseInt(params.conceptId, 10);
  if (Number.isNaN(conceptId)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/me/lesson/${conceptId}`);
  }

  const { data: learnerRows } = await supabase
    .from("learners")
    .select(
      "background, goal, mastery, path, current_concept, current_streak, sparks, badges, lesson_progress, weakness_sections, test_reviews"
    )
    .eq("user_id", user.id)
    .limit(1)
    .returns<LearnerRow[]>();

  const learner = learnerRows?.[0] ?? null;

  if (!learner?.goal) {
    redirect("/start");
  }

  const pathItems: PathItem[] = Array.isArray(learner.path)
    ? learner.path
    : [];

  const pathIndex = pathItems.findIndex((p) => p.concept_id === conceptId);
  if (pathIndex < 0) {
    redirect("/me");
  }

  const pathItem = pathItems[pathIndex];
  const requestedTier = resolveTier(pathItem.tier);

  const { data: conceptRows } = await supabase
    .from("concepts")
    .select("id, slug, title")
    .eq("id", conceptId)
    .limit(1)
    .returns<ConceptRow[]>();

  const concept = conceptRows?.[0] ?? null;
  if (!concept) {
    notFound();
  }

  let note: NoteRow | null = null;
  let effectiveTier = requestedTier;

  {
    const chain = tierFallbackChain(requestedTier);
    for (const tier of chain) {
      const { data: noteRows } = await supabase
        .from("concept_notes")
        .select(
          "title, summary, long_intro, deep_explanation, formal_definition, code_example, common_mistakes, real_world_usage, key_takeaways, key_idea, universal_analogy"
        )
        .eq("concept_id", conceptId)
        .eq("tier", tier)
        .limit(1)
        .returns<NoteRow[]>();

      note = noteRows?.[0] ?? null;
      if (note) {
        effectiveTier = tier;
        break;
      }
    }
  }

  let timeline: Timeline | null = null;
  {
    const chain = tierFallbackChain(effectiveTier);
    for (const tier of chain) {
      const { data: tlRows } = await supabase
        .from("concept_timeline")
        .select("timeline")
        .eq("concept_id", conceptId)
        .eq("tier", tier)
        .limit(1);

      const raw = (tlRows?.[0] as { timeline?: unknown } | undefined)
        ?.timeline;

      if (!raw) continue;

      const parsed = TimelineSchema.safeParse(raw);
      if (parsed.success) {
        timeline = parsed.data;
        effectiveTier = tier;
        break;
      }
      console.warn("[lesson] timeline validation failed:", parsed.error.issues);
    }
  }

  let conceptTest: ConceptTest | null = null;
  {
    const chain = tierFallbackChain(effectiveTier);
    for (const tier of chain) {
      const { data: testRows } = await supabase
        .from("concept_test")
        .select("questions")
        .eq("concept_id", conceptId)
        .eq("tier", tier)
        .limit(1);

      const raw = (testRows?.[0] as { questions?: unknown } | undefined)
        ?.questions;
      if (!raw) continue;

      const parsed = TestSchema.safeParse({ questions: raw });
      if (parsed.success) {
        conceptTest = parsed.data;
        effectiveTier = tier;
        break;
      }
      console.warn("[lesson] test validation failed:", parsed.error.issues);
    }
  }

  const masteryScore = learner.mastery?.[concept.slug] ?? 0;

  // Durable lesson state for this (concept, tier), written by
  // /api/lesson-progress and /api/test-submit.
  const progressKey = `${conceptId}:${effectiveTier}`;

  const progress = learner.lesson_progress?.[progressKey] ?? null;
  const initialStep = asInt(progress?.last_step);
  const initialCompletedAt =
    typeof progress?.completed_at === "string" ? progress.completed_at : null;
  const hasOpenedLesson =
    typeof progress?.last_step === "number" && progress.last_step > 0;

  const hasStrongUnread =
    masteryScore >= 0.7 && !hasOpenedLesson && initialCompletedAt === null;

  const weakness = learner.weakness_sections?.[progressKey] ?? null;
  const testReview = parseTestReview(learner.test_reviews?.[progressKey]);
  const initialReview: InitialReview | undefined = weakness
    ? {
        weak_sections: asStringArray(weakness.weak_sections),
        review_step: asInt(weakness.review_step),
        ...(testReview ? { test_review: testReview } : {}),
      }
    : undefined;

  const conceptNote: ConceptNoteForPlayer = note
    ? {
        title: note.title,
        summary: note.summary,
        long_intro: note.long_intro,
        deep_explanation: note.deep_explanation,
        formal_definition: note.formal_definition,
        code_example: note.code_example,
        common_mistakes: note.common_mistakes,
        real_world_usage: note.real_world_usage,
        key_takeaways: note.key_takeaways,
      }
    : {
        title: concept.title,
        summary: "Content not ready yet.",
        long_intro: null,
        deep_explanation: null,
        formal_definition: null,
        code_example: null,
        common_mistakes: null,
        real_world_usage: null,
        key_takeaways: null,
      };

  // Fallback timeline if deep content not seeded yet
  const playerTimeline: Timeline =
    timeline ??
    ([
      { type: "section", section_id: "long_intro" },
      { type: "section", section_id: "deep_explanation.0" },
      { type: "section", section_id: "deep_explanation.1" },
      { type: "section", section_id: "code_example" },
      { type: "section", section_id: "common_mistakes" },
      { type: "section", section_id: "real_world_usage" },
      { type: "section", section_id: "key_takeaways" },
      {
        type: "activity",
        activity: {
          type: "explain",
          prompt: `In your own words, what is the core idea of ${concept.title}?`,
          rubric: "Mentions the main idea and at least one concrete example.",
          min_words: 10,
        },
      },
    ] as Timeline);

  const estMin = Math.max(5, Math.ceil(playerTimeline.length * 2.5));

  return (
    <main className="min-h-screen">
      <nav
        className="sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "var(--bg-nav)" }}
      >
        <Container className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/me"
              className="flex items-center gap-1 text-sm font-semibold text-inkmuted transition-colors hover:text-ink"
              style={{ textDecoration: "none" }}
            >
              <ChevronLeft size={16} /> Dashboard
            </Link>
            <span className="text-inkfaint">/</span>
            <span className="truncate text-sm font-semibold">
              {concept.title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {learner.sparks != null && learner.sparks > 0 && (
              <span className="flex items-center gap-1 font-mono text-sm text-inkmuted">
                <Sparkles size={14} className="text-sparks" />
                {learner.sparks}
              </span>
            )}
            {learner.current_streak != null && learner.current_streak > 0 && (
              <span className="flex items-center gap-1 font-mono text-sm text-inkmuted">
                <Flame size={14} className="text-streak" />
                {learner.current_streak}
              </span>
            )}
            <SignOutButton />
          </div>
        </Container>
      </nav>

      <Container className="py-8">
        {/* Lesson header */}
        <div className="mb-8 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-4xl">{concept.title}</h1>
              <span
                className={`rounded-sm px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${
                  effectiveTier === "intermediate"
                    ? "badge-tier-intermediate"
                    : "badge-tier-beginner"
                }`}
              >
                {tierLabel(effectiveTier)}
              </span>
              <span className="flex items-center gap-1 rounded-sm bg-bgsubtle px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-inkmuted">
                <Clock size={12} /> Est. {estMin} min
              </span>
            </div>
            <p className="mt-2 max-w-md text-sm text-inkmuted">
              {conceptNote.summary}
            </p>
          </div>
          {concept.slug && (
            <div className="shrink-0 pt-1">
              <MasteryRing
                value={masteryScore}
                size={80}
                conceptSlug={concept.slug}
                showLabel
              />
            </div>
          )}
        </div>

        <div className="mt-8">
          {note || timeline ? (
            <LessonPlayer
              timeline={playerTimeline}
              conceptNote={conceptNote}
              test={conceptTest}
              conceptId={concept.id}
              tier={effectiveTier}
              conceptTitle={concept.title}
              conceptSlug={concept.slug}
              initialMastery={masteryScore}
              initialStep={initialStep}
              initialCompletedAt={initialCompletedAt}
              initialReview={initialReview}
              storedTestReview={testReview}
              initialPhase={
                hasStrongUnread
                  ? ("skip_choice" as const)
                  : ("learn" as const)
              }
            />
          ) : (
            <p className="card text-inkfaded">
              Deep lesson content is not ready yet. Run seed:deep after applying
              the migration.
            </p>
          )}
        </div>
      </Container>
    </main>
  );
}
