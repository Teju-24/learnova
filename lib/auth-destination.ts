import type { createClient } from "@/lib/supabase/client";

export type AuthDestination = "/me" | "/start";

/**
 * Where an authenticated user belongs: onboarded learners go to the
 * dashboard, everyone else to onboarding. Resolving this up front lets
 * callers navigate in one hop instead of bouncing off a guarded route.
 */
export async function resolveDestination(
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<AuthDestination> {
  const { data } = await supabase
    .from("learners")
    .select("goal")
    .eq("user_id", userId)
    .limit(1);
  const row = data?.[0] as { goal?: string | null } | undefined;
  return row?.goal ? "/me" : "/start";
}