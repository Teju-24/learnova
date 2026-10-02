"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Award, Compass, Flame, Sparkles, Target } from "lucide-react";
import StatCard from "@/components/StatCard";
import FeedbackCard from "@/components/FeedbackCard";
import CertificateClaim from "@/components/CertificateClaim";
import { fadeInUp } from "@/lib/motion";

type Props = {
  email: string;
  /** learner_name, falling back to the email local part. See lib/learner.ts. */
  displayName: string;
  background: string | null;
  goal: string;
  currentStreak: number;
  sparks: number;
  conceptsCompleted: number;
  showFeedbackPrompt: boolean;
  /** Every 5 concepts the check-in gets a deeper form. */
  showDeepFeedbackPrompt: boolean;
  /** Certificate progress, using the same measure as the issue route. */
  certificate: {
    mastered: number;
    required: number;
    remaining: number;
    met: boolean;
    /** Issue date when one has been issued, else null. */
    issuedAt: string | null;
  };
};

/**
 * The dashboard's top strip, greeting, certificate milestone and the
 * checkpoint feedback card. This is the section that only needs the learner row
 * and the certificate read, so it streams before the path and roadmap sections
 * have resolved.
 */
export default function DashboardHeader({
  email,
  displayName,
  background,
  goal,
  currentStreak,
  sparks,
  conceptsCompleted,
  showFeedbackPrompt,
  showDeepFeedbackPrompt,
  certificate,
}: Props) {
  // The avatar follows the display name, not the email — a learner who typed
  // "Priya Sharma" should not be greeted by "p".
  const initial = (displayName ?? "L").charAt(0).toUpperCase();

  function AvatarGlyph() {
    return <span className="font-heading text-sm font-bold">{initial}</span>;
  }

  return (
    <div className="space-y-8">
      {/* Top strip */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard
          icon={Flame}
          value={`${currentStreak}d`}
          label="Day streak"
          color="var(--streak)"
        />
        <StatCard
          icon={Sparkles}
          value={sparks}
          label="Sparks earned"
          color="var(--sparks)"
        />
        <StatCard
          icon={AvatarGlyph}
          value={displayName}
          label="View profile"
          sublabel={email}
          color="var(--primary)"
          href="/me/profile"
        />
      </motion.div>

      {/* Welcome */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl">Welcome back, {displayName}</h1>
          <span className="chip bg-primary-soft text-primary">
            <Target size={12} />
            <span className="max-w-[12rem] truncate normal-case">{goal}</span>
          </span>
          {/* Background is still worth showing, just not as the greeting. */}
          {background && (
            <span className="chip bg-bgsubtle text-inkmuted">
              <Compass size={12} />
              <span className="max-w-[12rem] truncate normal-case">
                {background}
              </span>
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-inkmuted">
          {currentStreak > 0
            ? `You're on a ${currentStreak}-day streak — keep it going.`
            : "Pick up where you left off."}
        </p>
      </motion.div>

      {/* Certificate: only surfaced once it is within reach, so it reads as a
          milestone rather than one more thing on the page. */}
      {certificate.issuedAt ? (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <Link
            href="/me/certificate"
            className="card flex flex-wrap items-center justify-between gap-4"
            style={{ textDecoration: "none", borderColor: "var(--gold)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "var(--gold-soft)",
                  color: "var(--gold)",
                }}
              >
                <Award size={22} />
              </span>
              <div>
                <p className="font-heading text-lg leading-tight">
                  You&apos;ve earned your certificate!
                </p>
                <p className="text-sm text-inkmuted">
                  View it, download a PDF, or share it.
                </p>
              </div>
            </div>
            <span className="btn-primary shrink-0">View certificate →</span>
          </Link>
        </motion.div>
      ) : certificate.remaining > 0 && certificate.remaining <= 4 ? (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <p className="text-sm text-inkmuted">
            {certificate.remaining} more concept
            {certificate.remaining === 1 ? "" : "s"} to earn your certificate.{" "}
            <Link
              href="/me/certificate"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              style={{ textDecoration: "none" }}
            >
              See how close you are
            </Link>
            .
          </p>
        </motion.div>
      ) : null}

      {certificate.met && !certificate.issuedAt && (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <CertificateClaim
            mastered={certificate.mastered}
            required={certificate.required}
          />
        </motion.div>
      )}

      {(showDeepFeedbackPrompt || showFeedbackPrompt) && (
        <motion.div variants={fadeInUp} initial="initial" animate="animate">
          <FeedbackCard
            variant={showDeepFeedbackPrompt ? "deep" : "light"}
            conceptsCompleted={conceptsCompleted}
            learnerName={displayName}
          />
        </motion.div>
      )}
    </div>
  );
}
