import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import { Container } from "@/components/Container";
import CertificateCard, {
  type CertificateData,
} from "@/components/CertificateCard";
import CertificateClaim from "@/components/CertificateClaim";
import { createClient } from "@/lib/supabase/server";
import {
  CERTIFICATE_AT,
  TOTAL_CONCEPTS,
  certificateProgress,
} from "@/lib/learner";

type LearnerRow = {
  mastery: Record<string, number> | null;
  learner_name: string | null;
};

type CertificateRow = {
  id: string;
  issued_at: string;
  learner_name: string;
  concepts_completed: number;
  total_sparks: number;
};

export const dynamic = "force-dynamic";

export default async function CertificatePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // learner_name needs migration 009; fall back so the page still works without it.
  let learnerRows: LearnerRow[] | null = null;
  {
    const BASE = "mastery";
    const { data, error } = await supabase
      .from("learners")
      .select(`${BASE}, learner_name`)
      .eq("user_id", user.id)
      .limit(1)
      .returns<LearnerRow[]>();

    if (error) {
      const retry = await supabase
        .from("learners")
        .select(BASE)
        .eq("user_id", user.id)
        .limit(1)
        .returns<LearnerRow[]>();
      learnerRows = retry.data;
    } else {
      learnerRows = data;
    }
  }

  const learner = learnerRows?.[0] ?? null;
  const progress = certificateProgress(learner?.mastery);

  // The certificates table needs migration 010. A missing table is not an
  // error here — it just means nothing has been issued yet.
  let certificate: CertificateRow | null = null;
  {
    const { data, error } = await supabase
      .from("certificates")
      .select("id, issued_at, learner_name, concepts_completed, total_sparks")
      .eq("user_id", user.id)
      .limit(1)
      .returns<CertificateRow[]>();

    if (error) {
      console.error(
        "[certificate] lookup failed (migration 010 applied?):",
        error.message
      );
    } else {
      certificate = data?.[0] ?? null;
    }
  }

  // Formatted here rather than in the client card: formatting on the client
  // would render the server's timezone first and the browser's after
  // hydration, and the award date would visibly change.
  const issued_on = certificate
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(certificate.issued_at))
    : "";

  const pct = Math.min(
    100,
    Math.round((progress.mastered / Math.max(1, CERTIFICATE_AT)) * 100)
  );

  return (
    <main
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, var(--primary-soft) 0%, var(--bg-page) 320px)`,
      }}
    >
      <nav
        className="no-print sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "var(--bg-nav)" }}
      >
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/me"
            className="flex items-center gap-1 text-sm font-semibold text-inkmuted transition-colors hover:text-ink"
            style={{ textDecoration: "none" }}
          >
            <ChevronLeft size={16} /> Dashboard
          </Link>
          <SignOutButton />
        </Container>
      </nav>

      <Container className="py-10">
        {certificate ? (
          <CertificateCard
            certificate={{
              ...certificate,
              issued_on,
            } as CertificateData}
          />
        ) : (
          <div className="mx-auto w-full max-w-2xl">
            <div className="text-center">
              <h1 className="font-heading text-3xl">Your certificate</h1>
              <p className="mt-2 text-inkmuted">
                {progress.met
                  ? "You’ve met the bar — claim it below."
                  : `You’re ${progress.remaining} concept${
                      progress.remaining === 1 ? "" : "s"
                    } away from earning your certificate.`}
              </p>
            </div>

            <div className="card mt-8">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">
                  {progress.mastered} of {CERTIFICATE_AT} concepts mastered
                </p>
                <p className="font-heading text-2xl text-primary">{pct}%</p>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-bgsubtle">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-inkmuted">
                Keep going to unlock it. The certificate is yours once
                {" "}
                {Math.round((CERTIFICATE_AT / TOTAL_CONCEPTS) * 100)}% of the{" "}
                {TOTAL_CONCEPTS}-concept curriculum is mastered.
              </p>

              <CertificateClaim
                mastered={progress.mastered}
                required={CERTIFICATE_AT}
                variant="page"
              />
            </div>
          </div>
        )}
      </Container>
    </main>
  );
}
