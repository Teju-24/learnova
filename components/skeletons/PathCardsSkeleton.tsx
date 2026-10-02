/** Placeholder for the "Your path" timeline while /me streams. */
export default function PathCardsSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-7 w-40 rounded" />
          <div className="skeleton h-4 w-64 rounded" />
        </div>
        <div className="skeleton h-10 w-40 rounded-lg" />
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-bgsubtle bg-bgcard px-3 py-2"
          >
            <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-56 rounded" />
            </div>
            <div className="skeleton h-8 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
