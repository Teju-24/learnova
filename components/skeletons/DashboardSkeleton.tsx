import DashboardHeaderSkeleton from "./DashboardHeaderSkeleton";
import RoadmapSkeleton from "./RoadmapSkeleton";
import PathCardsSkeleton from "./PathCardsSkeleton";
import ProfileCardSkeleton from "./ProfileCardSkeleton";

/**
 * The whole-dashboard fallback. Shown while the learner gate resolves
 * (`loadLearner` + the /start redirect check); the inner section boundaries then
 * replace each block as its own data arrives.
 */
export default function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <DashboardHeaderSkeleton />
      <RoadmapSkeleton />
      <PathCardsSkeleton />
      <ProfileCardSkeleton />
    </div>
  );
}
