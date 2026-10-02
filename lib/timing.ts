/**
 * Opt-in server timing for the dashboard.
 *
 * Set `DASHBOARD_DEBUG=1` in the deployment to get one log line per loader
 * (and a cache HIT/MISS marker for the concepts graph) in the function logs.
 * When unset, `timed` just forwards the call and only pays a `Date.now()`.
 *
 * Middleware additionally emits a `Server-Timing: mw-auth;dur=…` response
 * header, so the auth verification cost is visible in the browser's Network
 * panel without server log access.
 */
const ENABLED = process.env.DASHBOARD_DEBUG === "1";

export function dashboardLog(message: string): void {
  if (ENABLED) console.log(`[dashboard] ${message}`);
}

export async function timed<T>(
  label: string,
  run: () => PromiseLike<T>
): Promise<T> {
  if (!ENABLED) return run();
  const start = Date.now();
  try {
    return await run();
  } finally {
    console.log(`[dashboard-timing] ${label}: ${Date.now() - start}ms`);
  }
}
