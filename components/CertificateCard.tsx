"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, Share2 } from "lucide-react";

export type CertificateData = {
  id: string;
  issued_at: string;
  learner_name: string;
  concepts_completed: number;
  total_sparks: number;
  /** Pre-formatted server-side so the date cannot differ between renders. */
  issued_on: string;
};

type Props = {
  certificate: CertificateData;
};

/** Decorative gold rosette with ribbon tails. */
function Seal() {
  return (
    <svg viewBox="0 0 120 120" className="h-24 w-24 sm:h-28 sm:w-28" aria-hidden="true">
      {/* Ribbon first so the medal sits over it. */}
      <path d="M46 84 L38 118 L54 109 L60 120 L60 84 Z" fill="var(--gold)" opacity="0.8" />
      <path d="M74 84 L82 118 L66 109 L60 120 L60 84 Z" fill="var(--gold)" opacity="0.65" />
      <circle cx="60" cy="56" r="40" fill="var(--gold-soft)" />
      <circle
        cx="60"
        cy="56"
        r="34"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeDasharray="3 5"
      />
      <circle cx="60" cy="56" r="25" fill="var(--gold)" />
      <path
        d="M48 57 l9 9 l17 -19"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CertificateCard({ certificate }: Props) {
  const [copied, setCopied] = useState(false);
  const { id, learner_name, concepts_completed, total_sparks, issued_on } =
    certificate;

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${learner_name}'s Learnova certificate`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A cancelled native share sheet is not an error worth surfacing.
    }
  }

  return (
    <div>
      <div
        className="certificate-sheet mx-auto w-full max-w-3xl bg-bgcard px-8 py-10 sm:px-12"
        style={{
          border: "2px solid var(--gold)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 12px 40px rgba(91,79,233,0.08)",
        }}
      >
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Learnova
          </p>
          <h1 className="mt-3 font-heading text-3xl">Certificate of Completion</h1>
          <div
            className="mx-auto mt-4 h-px w-24"
            style={{ backgroundColor: "var(--gold)" }}
          />
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-inkmuted">This certifies that</p>
          <p className="mt-2 font-heading text-4xl text-primary sm:text-5xl">
            {learner_name}
          </p>
          <p className="mt-4 text-sm text-inkmuted">has successfully completed</p>
          <p className="mt-1 font-heading text-2xl">
            AI Foundations with Learnova
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold">Awarded on {issued_on}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
              <span className="status-pill bg-gold-soft text-gold">
                <Check size={12} /> {concepts_completed} concepts mastered
              </span>
              <span className="text-sm text-inkmuted">
                {total_sparks} Sparks earned
              </span>
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-inkfaint">
              Certificate ID {id}
            </p>
          </div>
          <Seal />
        </div>
      </div>

      <div className="no-print mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => window.print()} className="btn-primary">
          <Download size={16} className="mr-1.5 inline" />
          Download PDF
        </button>
        <button type="button" onClick={share} className="btn-secondary">
          <Share2 size={16} className="mr-1.5 inline" />
          {copied ? "Link copied" : "Share"}
        </button>
        <Link
          href="/me"
          className="text-sm font-semibold text-inkmuted underline-offset-2 hover:text-ink hover:underline"
          style={{ textDecoration: "none" }}
        >
          Back to dashboard
        </Link>
      </div>

      <p className="no-print mt-3 text-center text-xs text-inkfaint">
        Download PDF opens your browser&apos;s print dialog — choose &ldquo;Save as
        PDF&rdquo; to keep a copy.
      </p>
    </div>
  );
}
