"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Sparkles, XCircle } from "lucide-react";
import {
  GradingResultSchema,
  type GradingResult,
  type InteractionItem,
} from "@/lib/content-schema";
import type { LockableProps, OnComplete } from "./types";

type Props = {
  item: Extract<InteractionItem, { type: "explain" }>;
  conceptId: number;
  tier: string;
  sequenceIndex: number;
  onComplete: OnComplete;
} & LockableProps;

type AnswerResponse = {
  ok?: boolean;
  error?: string;
  new_mastery?: number;
};

const ACCENT = "var(--a-explain)";

const VERDICT_COLOR: Record<GradingResult["verdict"], string> = {
  correct: "var(--success)",
  partial: "var(--warning)",
  wrong: "var(--error)",
};

const VERDICT_ICON: Record<GradingResult["verdict"], typeof CheckCircle2> = {
  correct: CheckCircle2,
  partial: AlertTriangle,
  wrong: XCircle,
};

export default function Explain({
  item,
  conceptId,
  tier,
  sequenceIndex,
  onComplete,
  locked = false,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);

  const wordCount = answer.trim() === "" ? 0 : answer.trim().split(/\s+/).length;
  const targetWords = Math.max(item.min_words, Math.round(item.min_words * 2.5));
  // One grading call per attempt: a graded explanation, or a locked one in a
  // test, cannot be submitted again.
  const canSubmit =
    result === null && wordCount >= item.min_words && !submitting && !locked;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept_id: conceptId,
          tier,
          sequence: sequenceIndex,
          interaction_type: item.type,
          question: item.prompt,
          rubric: item.rubric,
          answer,
        }),
      });

      const data = (await res.json()) as AnswerResponse;
      const parsed = GradingResultSchema.safeParse(data);

      if (!res.ok || !parsed.success) {
        setError(
          (!res.ok && data.error) || "The grader did not return a usable result."
        );
        return;
      }

      setResult(parsed.data);
      onComplete(parsed.data.score, answer, {
        ...parsed.data,
        newMastery: data.new_mastery,
      });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const verdict = result?.verdict ?? null;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <Lightbulb size={18} />
        </span>
        <p className="font-heading text-xl">Explain it back</p>
      </div>

      <p className="mt-4 text-lg">{item.prompt}</p>
      <p className="mt-2 text-sm text-inkmuted">
        What you&apos;re aiming for: {item.rubric}
      </p>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
        disabled={result !== null}
        className="input mt-4"
        placeholder="Write your explanation…"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="status-pill bg-bgsubtle text-ink">
          <Sparkles size={12} />
          {wordCount} word{wordCount === 1 ? "" : "s"}
        </span>
        <span className="text-sm text-inkmuted">
          minimum {item.min_words} · aim for ~{targetWords}
        </span>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="btn-primary mt-4"
      >
        {submitting ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Grading…
          </>
        ) : (
          "Submit"
        )}
      </button>

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      {result && verdict && (
        <div
          className="mt-5 rounded-md border-l-4 px-4 py-3"
          style={{ borderLeftColor: VERDICT_COLOR[verdict] }}
        >
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = VERDICT_ICON[verdict];
              return <Icon size={18} style={{ color: VERDICT_COLOR[verdict] }} />;
            })()}
            <p
              className="text-sm font-bold uppercase tracking-wide"
              style={{ color: VERDICT_COLOR[verdict] }}
            >
              {verdict} · {Math.round(result.score * 100)}%
            </p>
          </div>
          <p className="mt-2 text-sm text-ink">{result.reason}</p>

          {result.model_answer && (
            <div
              className="mt-4 rounded-md border-l-4 px-4 py-3"
              style={{ borderLeftColor: "var(--success)", backgroundColor: "var(--success-soft)" }}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success">
                <Lightbulb size={13} /> What a complete answer looks like
              </p>
              <p className="mt-1 text-sm italic text-ink">{result.model_answer}</p>
              <p className="mt-2 text-xs text-inkmuted">
                Your answer was {wordCount} words; a good answer is usually
                around {targetWords} words.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}