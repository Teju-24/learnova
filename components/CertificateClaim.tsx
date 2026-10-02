"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award } from "lucide-react";

type Props = {
  /** Concepts mastered so far, from the same measure the route checks. */
  mastered: number;
  required: number;
  variant?: "banner" | "page";
};

/**
 * Claims the certificate when the bar is met. Kept as an explicit button rather
 * than written during a render or a prefetch: a GET that inserts a row would
 * fire from a link prefetch the moment the dashboard renders.
 *
 * The issue route is idempotent, so a double click or a repeat visit is
 * harmless — the original row is returned untouched.
 */
export default function CertificateClaim({
  mastered,
  required,
  variant = "banner",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = mastered >= required;
  if (!eligible) return null;

  async function claim() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/issue-certificate", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Could not issue the certificate");
      }
      // The row is new, so the server component has to re-read it.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (variant === "page") {
    return (
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="btn-primary"
        >
          <Award size={16} className="mr-1.5 inline" />
          {busy ? "Issuing…" : "Claim your certificate"}
        </button>
        {error && <p className="mt-3 text-sm text-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold)" }}
        >
          <Award size={22} />
        </span>
        <div>
          <p className="font-heading text-lg leading-tight">
            You&apos;ve earned your certificate!
          </p>
          <p className="text-sm text-inkmuted">
            {mastered} of {required} concepts mastered. Time to claim it.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={claim}
        disabled={busy}
        className="btn-primary shrink-0"
      >
        {busy ? "Issuing…" : "Claim certificate"}
      </button>
      {error && <p className="w-full text-sm text-error">{error}</p>}
    </div>
  );
}
