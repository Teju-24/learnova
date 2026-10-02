/** Placeholder for the "What the AI knows about you" card while /me streams. */
export default function ProfileCardSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="skeleton h-7 w-64 rounded" />
      <div className="skeleton mt-2 h-4 w-56 rounded" />
      <div className="card mt-4 space-y-6">
        <div className="flex flex-wrap gap-6">
          <div className="space-y-2">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-4 w-28 rounded" />
          </div>
          <div className="space-y-2">
            <div className="skeleton h-3 w-12 rounded" />
            <div className="skeleton h-4 w-32 rounded" />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
