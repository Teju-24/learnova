"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Check, Star, Sparkles } from "lucide-react";

type Pace = "too_slow" | "just_right" | "too_fast";
type Variant = "light" | "deep";

const PACES: { value: Pace; label: string }[] = [
  { value: "too_slow", label: "Too slow" },
  { value: "just_right", label: "Just right" },
  { value: "too_fast", label: "Too fast" },
];

type Props = {
  /** How many concepts the learner has completed so far. */
  conceptsCompleted: number;
  /** "light" every 2 concepts, "deep" every 5. */
  variant?: Variant;
  /** Called after a successful submit, so a host (modal) can close itself. */
  onDismiss?: () => void;
  /** Drop the card chrome when a parent surface already provides it. */
  plain?: boolean;
  /** Display name, so the thank-you is addressed to a person. */
  learnerName?: string;
};

export default function FeedbackCard({
  conceptsCompleted,
  variant = "light",
  onDismiss,
  plain = false,
  learnerName,
}: Props) {
  const router = useRouter();
  const isDeep = variant === "deep";
  const firstName = learnerName?.split(" ")[0]?.trim();

  const [pace, setPace] = useState<Pace | null>(null);
  const [interests, setInterests] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  async function submit() {
    if (!pace || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pace,
          interests,
          notes,
          variant,
          ...(isDeep && rating !== null ? { rating } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Could not save feedback");
      }
      setDismissed(true);
      // The server may have extended the path, so re-read the dashboard.
      router.refresh();
      onDismiss?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feedback");
      setSubmitting(false);
    }
  }

  const heading = firstName
    ? `Thanks, ${firstName} — let's tune your path`
    : isDeep
      ? "Let's tune your path"
      : "Quick check-in";

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            backgroundColor: isDeep ? "var(--success-soft)" : "var(--primary-soft)",
            color: isDeep ? "var(--success)" : "var(--primary)",
          }}
        >
          {isDeep ? <Sparkles size={18} /> : <MessageSquare size={18} />}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-inkfaint">
            {isDeep ? "Deep check-in" : "Quick check-in"}
          </p>
          <p className="font-heading text-xl leading-tight">{heading}</p>
        </div>
      </div>

      {isDeep ? (
        <p className="mt-5 text-sm text-inkmuted">
          You&apos;ve completed {conceptsCompleted} concept
          {conceptsCompleted === 1 ? "" : "s"}. A longer answer now gets you a
          re-planned path, not just a longer one.
        </p>
      ) : (
        <p className="mt-5 text-sm text-inkmuted">
          You&apos;ve completed {conceptsCompleted} concept
          {conceptsCompleted === 1 ? "" : "s"}.
        </p>
      )}

      <p className="mt-5 font-semibold">How is the pace so far?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PACES.map((option) => {
          const selected = pace === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setPace(option.value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                selected
                  ? "border-success text-success"
                  : "border-inkfaint text-inkmuted"
              }`}
              style={{
                backgroundColor: selected ? "var(--success-soft)" : "transparent",
              }}
            >
              {selected && <Check size={13} className="mr-1 inline" />}
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="mt-5 block font-semibold" htmlFor="feedback-interests">
        Anything you want to go deeper on?
      </label>
      {isDeep ? (
        <textarea
          id="feedback-interests"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          placeholder="List the topics you want more of — one per line works well."
          maxLength={500}
          rows={3}
          className="input mt-2"
        />
      ) : (
        <input
          id="feedback-interests"
          type="text"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          placeholder="e.g. backpropagation, embeddings, prompt design"
          maxLength={500}
          className="input mt-2"
        />
      )}

      {isDeep && (
        <>
          <label className="mt-4 block font-semibold" htmlFor="feedback-notes">
            Notes (optional)
          </label>
          <textarea
            id="feedback-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What is working, what is not, what should we change?"
            maxLength={1000}
            rows={4}
            className="input mt-2"
          />

          <p className="mt-5 font-semibold">
            How likely are you to recommend Learnova?
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = rating !== null && value <= rating;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`${value} of 5`}
                  aria-pressed={rating === value}
                  className="rounded-md p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={26}
                    className={selected ? "text-gold" : "text-inkfaint"}
                    fill={selected ? "currentColor" : "none"}
                    strokeWidth={selected ? 0 : 1.5}
                  />
                </button>
              );
            })}
            <span className="ml-2 font-mono text-sm text-inkmuted">
              {rating === null ? "—" : `${rating}/5`}
            </span>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={submit}
          disabled={!pace || submitting}
        >
          {submitting ? "Saving…" : "Submit feedback"}
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-inkmuted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          disabled={submitting}
        >
          Not now
        </button>
      </div>
    </>
  );

  if (plain) return <div>{body}</div>;

  return (
    <section
      className="card"
      style={{
        borderLeft: "4px solid var(--primary)",
        borderLeftStyle: "solid",
      }}
    >
      {body}
    </section>
  );
}