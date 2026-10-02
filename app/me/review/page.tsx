import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/Container";
import SignOutButton from "@/components/SignOutButton";
import ReviewSession, {
  NothingToReview,
  type ReviewItem,
} from "@/components/ReviewSession";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { reviewCandidates, type TestAttemptForReview } from "@/lib/learner";
import { InteractionItemSchema } from "@/lib/content-schema";

export const dynamic = "force-dynamic";

type PathItem = {
  concept_id: number;
  tier: string;
};

type ConceptRow = {
  id: number;
  slug: string;
  title: string;
  prerequisites: number[] | null;
};

type QuestionRow = {
  concept_id: number;
  tier: string;
  questions: unknown;
};

export default async function ReviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: learnerRows } = await supabase
    .from("learners")
    .select("goal, mastery, path")
    .eq("user_id", user.id)
    .limit(1);

  const learner = learnerRows?.[0] ?? null;
  if (!learner?.goal) {
    redirect("/start");
  }

  const pathItems: PathItem[] = Array.isArray(learner.path) ? learner.path : [];
  const mastery = learner.mastery ?? {};
  const pathIds = pathItems.map((p) => p.concept_id);

  if (pathIds.length === 0) {
    return <ReviewShell><NothingToReview /></ReviewShell>;
  }

  const [{ data: conceptRows }, { data: seenRows }, { data: attemptRows }] =
    await Promise.all([
      supabase
        .from("concepts")
        .select("id, slug, title, prerequisites")
        .in("id", pathIds)
        .returns<ConceptRow[]>(),
      supabase
        .from("learner_concepts")
        .select("concept_id, last_seen")
        .eq("user_id", user.id)
        .in("concept_id", pathIds),
      supabase
        .from("test_attempts")
        .select("concept_id, passed, created_at")
        .eq("user_id", user.id)
        .in("concept_id", pathIds)
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<TestAttemptForReview[]>(),
    ]);

  // Prerequisites can sit outside the path, so resolve any that do before
  // building the id -> slug map that mastery is keyed through.
  const slugById = new Map<number, string>(
    (conceptRows ?? []).map((c) => [c.id, c.slug])
  );
  const titleById = new Map<number, string>(
    (conceptRows ?? []).map((c) => [c.id, c.title])
  );
  const outsidePath = new Set<number>();
  for (const concept of conceptRows ?? []) {
    for (const id of Array.isArray(concept.prerequisites)
      ? concept.prerequisites
      : []) {
      if (typeof id === "number" && !slugById.has(id)) outsidePath.add(id);
    }
  }
  if (outsidePath.size > 0) {
    const { data: prereqRows } = await supabase
      .from("concepts")
      .select("id, slug, title")
      .in("id", Array.from(outsidePath));
    for (const row of prereqRows ?? []) {
      slugById.set(row.id, row.slug);
      titleById.set(row.id, row.title);
    }
  }

  const lastSeenByConcept = new Map<number, string>();
  for (const row of (seenRows ?? []) as { concept_id: number; last_seen: string }[]) {
    if (typeof row.last_seen === "string") {
      lastSeenByConcept.set(row.concept_id, row.last_seen);
    }
  }

  // The same computation the dashboard used to decide whether to show the card,
  // so the session can never disagree with the prompt that led to it.
  const candidates = reviewCandidates({
    pathItems,
    slugById,
    titleById,
    mastery,
    lastSeenByConcept,
    attempts: attemptRows ?? [],
  });

  if (candidates.length === 0) {
    return <ReviewShell><NothingToReview /></ReviewShell>;
  }

  // One question per candidate, drawn at random from that concept's test bank.
  const candidateTiers = candidates.map((c) => ({
    conceptId: c.conceptId,
    tier: resolveTier(c.tier),
  }));

  const { data: questionRows } = await supabase
    .from("concept_test")
    .select("concept_id, tier, questions")
    .in("concept_id", candidateTiers.map((c) => c.conceptId))
    .returns<QuestionRow[]>();

  const testsByConceptTier = new Map<string, QuestionRow>();
  for (const row of questionRows ?? []) {
    testsByConceptTier.set(`${row.concept_id}:${row.tier}`, row);
  }

  const items: ReviewItem[] = [];
  for (const candidate of candidates) {
    const wantTier = candidateTiers.find(
      (t) => t.conceptId === candidate.conceptId
    )!.tier;

    // The path's tier is the first choice, but a concept can have a bank on
    // another tier only, so fall back to whatever tier does have questions.
    const row =
      testsByConceptTier.get(`${candidate.conceptId}:${wantTier}`) ??
      questionRows?.find(
        (r) =>
          r.concept_id === candidate.conceptId &&
          Array.isArray(r.questions) &&
          r.questions.length > 0
      );

    const bank = Array.isArray(row?.questions) ? row!.questions : [];
    if (bank.length === 0) continue;

    // The stored question carries its own answer key, and the interaction
    // components need it to give instant feedback. concept_test is publicly
    // readable, so the key is not a secret here; what the server does own is the
    // decision to move mastery, which /api/review-submit re-derives itself.
    const questionIndex = Math.floor(Math.random() * bank.length);
    const parsed = InteractionItemSchema.safeParse(bank[questionIndex]);
    if (!parsed.success) continue;

    items.push({
      conceptId: candidate.conceptId,
      title: candidate.title,
      reason: candidate.reason,
      tier: row!.tier,
      questionIndex,
      question: parsed.data,
    });
  }

  return (
    <ReviewShell>
      {items.length > 0 ? (
        <ReviewSession items={items} />
      ) : (
        <NothingToReview />
      )}
    </ReviewShell>
  );
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <nav
        className="sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "var(--bg-nav)" }}
      >
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/me"
            className="font-heading text-xl font-bold"
            style={{ textDecoration: "none" }}
          >
            Learnova
          </Link>
          <SignOutButton />
        </Container>
      </nav>

      <Container className="py-8 pb-24">
        <div className="mx-auto max-w-2xl">{children}</div>
      </Container>
    </main>
  );
}
