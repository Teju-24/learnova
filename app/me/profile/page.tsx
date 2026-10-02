import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ChevronLeft } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import { Container } from "@/components/Container";
import Profile, {
  type DailyCell,
  type ProfileBadge,
  type SparkRow,
} from "@/components/Profile";
import WeeklyGoals from "@/components/WeeklyGoals";
import ShareProgressButton from "@/components/ShareProgressButton";
import type { PrerequisiteGraphProps } from "@/components/PrerequisiteGraph";
import Toast from "@/components/Toast";
import { createClient } from "@/lib/supabase/server";
import { BADGES } from "@/lib/gamification";
import {
  CERTIFICATE_AT,
  certificateProgress,
  conceptsCompletedThisWeek,
  displayName,
  initialFor,
  minutesThisWeek,
  DEFAULT_GOAL_CONCEPTS,
  DEFAULT_GOAL_MINUTES,
} from "@/lib/learner";

type LearnerRow = {
  user_id: string;
  goal: string | null;
  background: string | null;
  /** Migration 009; null when the learner skipped the name step. */
  learner_name: string | null;
  mastery: Record<string, number> | null;
  sparks: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  badges: string[] | null;
  /** Migration 008: `${conceptId}:${tier}` -> ISO timestamp of first completion. */
  concept_completed_at: Record<string, unknown> | null;
  /** The ordered learning path, one entry per concept. */
  path: { concept_id: number }[] | null;
  current_concept: number | null;
};

type GoalRow = {
  weekly_goal_concepts: number;
  weekly_goal_minutes: number;
};

type CertificateRow = {
  issued_at: string;
};

type DailyRow = {
  date: string;
  sparks_earned: number;
  /** Needed for the weekly minutes estimate, computed from the rows below. */
  read_lessons: number | null;
  interactions_completed: number | null;
};

type SparksLogRow = {
  amount: number;
  reason: string;
  created_at: string;
};

type ConceptRow = {
  id: number;
  slug: string;
  title: string;
  /** 1-5; drives which column the graph puts the node in. */
  difficulty: number;
  /** Prerequisite concept IDs, which the graph draws as edges. */
  prerequisites: number[] | null;
};

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: learnerRows } = await supabase
    .from("learners")
    .select(
      "user_id, goal, background, mastery, sparks, current_streak, longest_streak, badges, learner_name, concept_completed_at, path, current_concept"
    )
    .eq("user_id", user.id)
    .limit(1)
    .returns<LearnerRow[]>();

  const learner = learnerRows?.[0] ?? null;
  if (!learner?.goal) {
    redirect("/start");
  }

  // The goal columns arrive with migration 012, which is not applied to every
  // project yet. Selected on their own so a missing column falls back to the
  // defaults instead of failing the query above — which would read as "no
  // profile" and bounce the learner back to /start.
  const { data: goalRows } = await supabase
    .from("learners")
    .select("weekly_goal_concepts, weekly_goal_minutes")
    .eq("user_id", user.id)
    .limit(1)
    .returns<GoalRow[]>();

  const goalConcepts =
    goalRows?.[0]?.weekly_goal_concepts ?? DEFAULT_GOAL_CONCEPTS;
  const goalMinutes = goalRows?.[0]?.weekly_goal_minutes ?? DEFAULT_GOAL_MINUTES;

  const { data: dailyRows } = await supabase
    .from("daily_activity")
    .select("date, sparks_earned, read_lessons, interactions_completed")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30)
    .returns<DailyRow[]>();

  const { data: sparksRows } = await supabase
    .from("sparks_log")
    .select("amount, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<SparksLogRow[]>();

  const { data: concepts } = await supabase
    .from("concepts")
    .select("id, slug, title, difficulty, prerequisites")
    .returns<ConceptRow[]>();

  // Migration 010 not applied yet is not an error: nothing has been issued.
  const { data: certificateRows } = await supabase
    .from("certificates")
    .select("issued_at")
    .eq("user_id", user.id)
    .limit(1)
    .returns<CertificateRow[]>();
  const certificate = certificateRows?.[0] ?? null;

  const mastery = learner.mastery ?? {};
  const masteredCount = Object.values(mastery).filter((m) => m >= 0.7).length;
  const totalConcepts = concepts?.length ?? 20;
  const certificateState = certificateProgress(mastery);
  const unlockedSet = new Set(
    Array.isArray(learner.badges) ? learner.badges : []
  );

  const badges: ProfileBadge[] = BADGES.map((badge) => ({
    id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    unlocked: unlockedSet.has(badge.id),
  }));

  const name = displayName(learner.learner_name, user.email);
  const initial = initialFor(name);
  const certificatePct = Math.min(
    100,
    Math.round((certificateState.mastered / Math.max(1, CERTIFICATE_AT)) * 100)
  );
  const certificateDate = certificate
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(certificate.issued_at))
    : null;

  // Build last 30 days grid (oldest → newest for left-to-right)
  const today = new Date();
  const dayMap = new Map(
    (dailyRows ?? []).map((r) => [r.date, r.sparks_earned])
  );
  const last30: DailyCell[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    last30.push({ date: iso, sparks: dayMap.get(iso) ?? 0 });
  }
  const activeDays = last30.filter((d) => d.sparks > 0).length;

  // Weekly goals. Concepts come from the completion map; minutes are estimated
  // from the same daily_activity rows already loaded for the 30-day grid, so
  // this costs no extra query.
  const weeklyProgress = {
    concepts: conceptsCompletedThisWeek(learner.concept_completed_at),
    minutes: minutesThisWeek(dailyRows ?? []),
  };

  const recentSparks: SparkRow[] = (sparksRows ?? []).slice(0, 10);

  // The curriculum graph. `path` stores the ordered learning path; the
  // completion map is keyed `${conceptId}:${tier}`, so the id is the prefix.
  // Both are nullable on older rows, so they fall back to empty instead of
  // letting one missing value blank the graph.
  const pathIds = Array.isArray(learner.path)
    ? learner.path.map((p) => p.concept_id)
    : [];
  const completedIds = Array.from(
    new Set(
      Object.keys(learner.concept_completed_at ?? {})
        .map((key) => Number.parseInt(key.split(":")[0] ?? "", 10))
        .filter((id) => Number.isFinite(id))
    )
  );
  const graph: PrerequisiteGraphProps | undefined =
    concepts && concepts.length > 0
      ? {
          concepts: concepts.map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            difficulty: c.difficulty,
            prerequisites: c.prerequisites ?? [],
          })),
          mastery,
          pathIds,
          completedIds,
          currentId: learner.current_concept ?? null,
        }
      : undefined;

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
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </Container>
      </nav>

      <Container className="py-8">
        <Profile
          initial={initial}
          name={name}
          email={user.email ?? ""}
          goal={learner.goal}
          background={learner.background}
          currentStreak={learner.current_streak ?? 0}
          longestStreak={learner.longest_streak ?? 0}
          sparks={learner.sparks ?? 0}
          masteredCount={masteredCount}
          totalConcepts={totalConcepts}
          last30={last30}
          activeDays={activeDays}
          recentSparks={recentSparks}
          badges={badges}
          graph={graph}
          shareSlot={
            <ShareProgressButton
              learnerName={name}
              sparks={learner.sparks ?? 0}
              currentStreak={learner.current_streak ?? 0}
              conceptsMastered={masteredCount}
              badges={badges}
            />
          }
        />

        <WeeklyGoals
          goalConcepts={goalConcepts}
          goalMinutes={goalMinutes}
          progress={weeklyProgress}
        />

        {/* Certificate */}
        <div className="card mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: certificate ? "var(--gold-soft)" : "var(--bg-subtle)",
                  color: certificate ? "var(--gold)" : "var(--ink-faint)",
                }}
              >
                <Award size={22} />
              </span>
              <div>
                <p className="font-heading text-lg leading-tight">Certificate</p>
                <p className="text-sm text-inkmuted">
                  {certificateDate
                    ? `Earned on ${certificateDate}`
                    : `${certificateState.mastered}/${CERTIFICATE_AT} concepts to unlock`}
                </p>
              </div>
            </div>
            <Link
              href="/me/certificate"
              className="btn-secondary shrink-0"
              style={{ textDecoration: "none" }}
            >
              {certificate ? "View certificate" : "See progress"}
            </Link>
          </div>
          {!certificate && (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bgsubtle">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${certificatePct}%` }}
              />
            </div>
          )}
        </div>
      </Container>

      {/* fireToast dispatches a window event, so it needs a listener on the page
          that raises it. This was the only place in the app missing one. */}
      <Toast />
    </main>
  );
}