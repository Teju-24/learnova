import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CERTIFICATE_AT, displayName } from "@/lib/learner";

export const dynamic = "force-dynamic";

type LearnerRow = {
  mastery: Record<string, number> | null;
  sparks: number | null;
  learner_name: string | null;
};

type CertificateRow = {
  id: string;
  issued_at: string;
  learner_name: string;
  concepts_completed: number;
  total_sparks: number;
};

type ExistingRow = Pick<
  CertificateRow,
  "id" | "issued_at" | "learner_name" | "concepts_completed" | "total_sparks"
>;

/**
 * Issues the completion certificate once the learner has mastered
 * CERTIFICATE_AT concepts.
 *
 * Idempotent in both directions: already-issued returns the original row
 * untouched, and below the bar returns progress rather than an error, so the
 * page can render the locked state from the same call.
 */
export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // learner_name arrives with migration 009. Fall back to the old column list
    // so the certificate still works before the migration is applied.
    let learnerRows: LearnerRow[] | null = null;
    {
      const BASE = "mastery, sparks";
      const { data, error } = await supabase
        .from("learners")
        .select(`${BASE}, learner_name`)
        .eq("user_id", user.id)
        .limit(1)
        .returns<LearnerRow[]>();

      if (error) {
        console.error(
          "[api/issue-certificate] learner select failed:",
          error.message
        );
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

    const learner = learnerRows?.[0];
    if (!learner) {
      return NextResponse.json(
        { ok: false, error: "No learner profile" },
        { status: 404 }
      );
    }

    // Same measure as the dashboard: mastery at or above the threshold.
    const mastered = Object.values(learner.mastery ?? {}).reduce(
      (total, score) =>
        typeof score === "number" && score >= 0.7 ? total + 1 : total,
      0
    );

    // Already issued? Return the original — including its issue date, so
    // repeated calls can never move or re-snapshot a certificate.
    const { data: existingRows, error: existingError } = await supabase
      .from("certificates")
      .select("id, issued_at, learner_name, concepts_completed, total_sparks")
      .eq("user_id", user.id)
      .limit(1)
      .returns<ExistingRow[]>();

    if (existingError) {
      // Almost always a missing migration 010. Say so plainly: without the
      // table there is nothing to issue into.
      console.error(
        "[api/issue-certificate] certificate lookup failed:",
        existingError.message
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Certificates are not available yet",
          needsMigration: true,
          progress: mastered,
          required: CERTIFICATE_AT,
        },
        { status: 503 }
      );
    }

    const existing = existingRows?.[0];
    if (existing) {
      return NextResponse.json({ ok: true, certificate: existing });
    }

    if (mastered < CERTIFICATE_AT) {
      return NextResponse.json({
        ok: false,
        message: `Complete ${CERTIFICATE_AT} concepts to earn your certificate`,
        progress: mastered,
        required: CERTIFICATE_AT,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("certificates")
      .insert({
        user_id: user.id,
        learner_name: displayName(learner.learner_name, user.email),
        concepts_completed: mastered,
        total_sparks: learner.sparks ?? 0,
      })
      .select("id, issued_at, learner_name, concepts_completed, total_sparks")
      .returns<ExistingRow[]>()
      .single();

    if (insertError) {
      // A concurrent double-submit loses the unique(user_id) race. The row
      // exists, so read it back and return that rather than an error.
      console.error(
        "[api/issue-certificate] insert failed:",
        insertError.message
      );
      const { data: raced } = await supabase
        .from("certificates")
        .select("id, issued_at, learner_name, concepts_completed, total_sparks")
        .eq("user_id", user.id)
        .limit(1)
        .returns<ExistingRow[]>();
      if (raced?.[0]) {
        return NextResponse.json({ ok: true, certificate: raced[0] });
      }
      return NextResponse.json(
        { ok: false, error: "Could not issue certificate" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, certificate: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/issue-certificate] unexpected failure:", message);
    return NextResponse.json(
      { ok: false, error: "Something went wrong" },
      { status: 500 }
    );
  }
}
