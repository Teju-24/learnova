import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Container } from "@/components/Container";
import SignOutButton from "@/components/SignOutButton";
import GlossaryView, {
  type GlossaryEntry,
} from "@/components/GlossaryView";
import { createClient } from "@/lib/supabase/server";
import {
  conceptStatus,
  isConceptUnlocked,
} from "@/lib/learner";

type ConceptRow = {
  id: number;
  slug: string;
  title: string;
  difficulty: number;
  prerequisites: number[] | null;
};

type NoteRow = {
  concept_id: number;
  summary: string;
};

type LearnerRow = {
  mastery: Record<string, number> | null;
  lesson_progress:
    | Record<string, { last_step?: unknown; completed_at?: unknown }>
    | null;
  concept_completed_at: Record<string, unknown> | null;
};

export default async function GlossaryPage() {
  const supabase = await createClient();

  // Optional. A visitor who is not signed in still gets the full curriculum
  // list; only the per-learner status badges are meaningless without a row.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: conceptRows, error: conceptError } = await supabase
    .from("concepts")
    .select("id, slug, title, difficulty, prerequisites")
    .order("difficulty")
    .order("id")
    .returns<ConceptRow[]>();

  if (conceptError) {
    console.error("[glossary] could not read concepts:", conceptError.message);
  }
  const concepts = conceptRows ?? [];

  // One line per concept, taken from the beginner note: it is the shortest and
  // the only tier every concept in the curriculum is guaranteed to have.
  const { data: noteRows } = await supabase
    .from("concept_notes")
    .select("concept_id, summary")
    .eq("tier", "beginner")
    .returns<NoteRow[]>();
  const summaryById = new Map((noteRows ?? []).map((n) => [n.concept_id, n.summary]));

  let mastery: Record<string, number> = {};
  let lessonProgress: LearnerRow["lesson_progress"] = null;
  let completionMap: Record<string, unknown> = {};

  if (user) {
    const { data: learnerRows } = await supabase
      .from("learners")
      .select("mastery, lesson_progress, concept_completed_at")
      .eq("user_id", user.id)
      .limit(1)
      .returns<LearnerRow[]>();

    const learner = learnerRows?.[0];
    mastery = learner?.mastery ?? {};
    lessonProgress = learner?.lesson_progress ?? null;
    completionMap = learner?.concept_completed_at ?? {};
  }

  // Mastery is keyed by slug, so every prerequisite id has to be resolved
  // before the unlock test can run.
  const slugById = new Map<number, string>(
    concepts.map((c) => [c.id, c.slug])
  );
  const titleById = new Map<number, string>(
    concepts.map((c) => [c.id, c.title])
  );

  const entries: GlossaryEntry[] = concepts.map((concept) => {
    const prerequisites = Array.isArray(concept.prerequisites)
      ? concept.prerequisites
      : [];

    return {
      id: concept.id,
      slug: concept.slug,
      title: concept.title,
      summary:
        summaryById.get(concept.id) ??
        "No summary has been written for this concept yet.",
      difficulty: concept.difficulty,
      prerequisiteTitles: prerequisites
        .map((id) => titleById.get(id))
        .filter((title): title is string => Boolean(title)),
      status: conceptStatus({
        conceptId: concept.id,
        slug: concept.slug,
        prerequisites,
        mastery,
        completionMap,
        lessonProgress,
        slugById,
      }),
      unlocked: isConceptUnlocked(prerequisites, mastery, slugById),
    };
  });

  return (
    <main className="min-h-screen">
      <nav
        className="sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "var(--bg-nav)" }}
      >
        <Container className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={user ? "/me" : "/"}
              className="flex shrink-0 items-center gap-2"
              style={{ textDecoration: "none" }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <Sparkles size={16} className="text-white" />
              </span>
              <span className="font-heading text-xl font-bold">Learnova</span>
            </Link>
            {user && (
              <Link
                href="/me"
                className="hidden items-center gap-1 text-sm font-semibold text-inkmuted transition-colors hover:text-ink sm:flex"
                style={{ textDecoration: "none" }}
              >
                <ChevronLeft size={16} /> Dashboard
              </Link>
            )}
          </div>
          {user ? <SignOutButton /> : <span />}
        </Container>
      </nav>

      <Container className="py-8">
        <h1 className="font-heading text-3xl">Glossary</h1>
        <p className="mt-1 max-w-2xl text-sm text-inkmuted">
          Every concept in the curriculum, what it needs before it, and where you
          are with it.
        </p>

        <div className="mt-6">
          <GlossaryView entries={entries} signedIn={Boolean(user)} />
        </div>
      </Container>
    </main>
  );
}
