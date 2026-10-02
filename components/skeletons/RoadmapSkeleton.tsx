/** Placeholder for the review card + roadmap strip while /me streams. */
export default function RoadmapSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <section>
        <div className="skeleton h-7 w-32 rounded" />
        <div className="skeleton mt-2 h-4 w-56 rounded" />
        <div className="skeleton mt-4 rounded-lg" style={{ height: 220 }} />
      </section>
    </div>
  );
}
