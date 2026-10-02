import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import SignOutButton from "@/components/SignOutButton";
import { Container } from "@/components/Container";
import FeedbackFab from "@/components/FeedbackFab";
import Roadmap from "@/components/Roadmap";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardReview from "@/components/dashboard/DashboardReview";
import DashboardPath from "@/components/dashboard/DashboardPath";
import DashboardProfile from "@/components/dashboard/DashboardProfile";
import DashboardHeaderSkeleton from "@/components/skeletons/DashboardHeaderSkeleton";
import RoadmapSkeleton from "@/components/skeletons/RoadmapSkeleton";
import PathCardsSkeleton from "@/components/skeletons/PathCardsSkeleton";
import ProfileCardSkeleton from "@/components/skeletons/ProfileCardSkeleton";
import {
  getAuthUser,
  loadCertificate,
  loadFeedbackInterests,
  loadLearner,
  loadPathView,
  loadReviewData,
} from "@/lib/dashboard-data";
import { countMasteredConcepts } from "@/lib/tier";
import { certificateProgress, displayName } from "@/lib/learner";

/*
 * The dashboard is split into four independently-streamed sections. Each has
 * its own async Server Component and Suspense boundary, so the top strip and
 * greeting paint as soon as the learner row is available while the heavier
 * path, attempt and review reads keep loading behind skeletons. Shared reads
 * (the learner row, the concepts graph, the path view) are de-duplicated by the
 * React.cache-wrapped loaders in lib/dashboard-data.ts, so splitting the page
 * does not multiply the queries.
 */

async function HeaderSection({ user }: { user: User }) {
  // Both reads only need the user id, so they run together.
  const [learner, certificate] = await Promise.all([
    loadLearner(user.id),
    loadCertificate(user.id),
  ]);
  if (!learner) return null;

  const name = displayName(learner.learner_name, user.email);
  const conceptsCompleted = countMasteredConcepts(learner.mastery);
  const progress = certificateProgress(learner.mastery);

  return (
    <>
      <DashboardHeader
        email={user.email ?? ""}
        displayName={name}
        background={learner.background}
        goal={learner.goal ?? ""}
        currentStreak={learner.current_streak ?? 0}
        sparks={learner.sparks ?? 0}
        conceptsCompleted={conceptsCompleted}
        showFeedbackPrompt={learner.show_feedback_prompt ?? false}
        showDeepFeedbackPrompt={learner.show_deep_feedback_prompt ?? false}
        certificate={{
          mastered: progress.mastered,
          required: progress.required,
          remaining: progress.remaining,
          met: progress.met,
          issuedAt: certificate.issuedAt,
        }}
      />
      <FeedbackFab conceptsCompleted={conceptsCompleted} learnerName={name} />
    </>
  );
}

async function RoadmapSection({ userId }: { userId: string }) {
  // The path view and the review candidates are independent reads; the review
  // one also needs the path, which the shared loader resolves once.
  const [pathData, reviews] = await Promise.all([
    loadPathView(userId),
    loadReviewData(userId),
  ]);

  return (
    <div className="space-y-8">
      <DashboardReview reviewCandidates={reviews} />
      {pathData.totalConcepts > 0 && <Roadmap {...pathData.roadmap} />}
    </div>
  );
}

async function PathSection({ userId }: { userId: string }) {
  const { pathView, totalConcepts } = await loadPathView(userId);
  return <DashboardPath pathView={pathView} totalConcepts={totalConcepts} />;
}

async function ProfileSection({ userId }: { userId: string }) {
  const [learner, interests, pathData] = await Promise.all([
    loadLearner(userId),
    loadFeedbackInterests(userId),
    loadPathView(userId),
  ]);
  if (!learner) return null;

  return (
    <DashboardProfile
      background={learner.background}
      goal={learner.goal ?? ""}
      interests={interests}
      pathView={pathData.pathView}
    />
  );
}

export default async function MePage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  // The learner row is needed by every section and gates the onboarding
  // redirect, so it is resolved once here. It is cached, so the sections below
  // do not re-query it.
  const learner = await loadLearner(user.id);
  if (!learner?.goal) {
    redirect("/start");
  }

  return (
    <main className="min-h-screen">
      <nav
        className="sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "var(--bg-nav)" }}
      >
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="font-heading text-xl font-bold"
            style={{ textDecoration: "none" }}
          >
            Learnova
          </Link>
          <SignOutButton />
        </Container>
      </nav>

      <Container className="py-8 pb-24">
        <div className="space-y-8">
          <Suspense fallback={<DashboardHeaderSkeleton />}>
            <HeaderSection user={user} />
          </Suspense>
          <Suspense fallback={<RoadmapSkeleton />}>
            <RoadmapSection userId={user.id} />
          </Suspense>
          <Suspense fallback={<PathCardsSkeleton />}>
            <PathSection userId={user.id} />
          </Suspense>
          <Suspense fallback={<ProfileCardSkeleton />}>
            <ProfileSection userId={user.id} />
          </Suspense>
        </div>
      </Container>
    </main>
  );
}
