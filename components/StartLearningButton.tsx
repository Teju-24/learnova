"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveDestination } from "@/lib/auth-destination";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/**
 * "Start learning" resolves where the learner belongs before it navigates, so
 * nobody sees /start render and then bounce away:
 *   no session      -> /login?next=/start
 *   session, no goal-> /start (onboarding)
 *   session + goal  -> /me (dashboard)
 */
export default function StartLearningButton({
  className = "btn-primary",
  children,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?next=/start");
        return;
      }

      const dest = await resolveDestination(user.id, supabase);
      router.push(dest);
      router.refresh();
    } catch {
      // Anything unexpected: fall back to sign-in rather than a dead button.
      setBusy(false);
      router.push("/login?next=/start");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy}
      className={className}
    >
      {children ?? (
        <>
          Start learning <ArrowRight size={17} />
        </>
      )}
    </button>
  );
}