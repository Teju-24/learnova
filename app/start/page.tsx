"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Container } from "@/components/Container";

const BACKGROUND_CHIPS = [
  "Chemistry",
  "Biology",
  "Engineering",
  "Business",
  "Math",
  "Design",
  "Other",
];

const GOAL_CHIPS = [
  "Build a RAG app",
  "Understand transformers",
  "Get an AI job",
  "Use AI in my research",
  "Just curious",
];

const DIAGNOSTIC_QUESTIONS = [
  {
    concept_slug: "python-basics",
    question: "In one or two sentences, what does a variable store in Python?",
  },
  {
    concept_slug: "supervised-learning",
    question:
      "What is the difference between a model learning from labeled data vs. unlabeled data?",
  },
  {
    concept_slug: "gradient-descent",
    question:
      "What does it mean to 'train' a model — what is being adjusted and why?",
  },
] as const;

const TIPS = [
  "Embeddings turn words into numbers.",
  "Gradient descent finds the lowest point.",
  "RAG = Retrieval + Augmented Generation.",
  "Transformers use attention to weigh context.",
  "Vector databases store embeddings for fast search.",
  "Loss functions measure how wrong a model is.",
  "Backprop is how networks learn from mistakes.",
  "Tokenization splits text into model-sized pieces.",
  "Overfitting means the model memorized, not learned.",
  "Fine-tuning adapts a pretrained model to your data.",
];

const MIN_LOADING_MS = 6_000;
const POLL_INTERVAL_MS = 2_000;

type OnboardResponse = {
  ok?: boolean;
  error?: string;
  alreadyOnboarded?: boolean;
};

type ConceptPreview = {
  id: number;
  title: string;
  difficulty: number;
};

const STEPS = ["Background", "Name", "Goal", "Placement"] as const;

function difficultyLabel(d: number): string {
  if (d <= 1) return "intro";
  if (d <= 2) return "easy";
  if (d <= 3) return "medium";
  if (d <= 4) return "hard";
  return "expert";
}

export default function StartPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [backgroundChip, setBackgroundChip] = useState("");
  const [backgroundText, setBackgroundText] = useState("");
  const [nameText, setNameText] = useState("");
  const [goalChip, setGoalChip] = useState("");
  const [goalText, setGoalText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewConcepts, setPreviewConcepts] = useState<ConceptPreview[]>([]);
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [visibleCards, setVisibleCards] = useState(0);

  const submitStartedAt = useRef<number>(0);
  const readyRef = useRef(false);

  // Guard: if already onboarded, go straight to /me
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login?next=/start");
        return;
      }

      const { data: rows } = await supabase
        .from("learners")
        .select("goal")
        .eq("user_id", user.id)
        .limit(1);

      if (cancelled) return;
      if (rows?.[0]?.goal) {
        router.replace("/me");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Pull 3 random concepts for the loading screen
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("concepts")
      .select("id, title, difficulty")
      .limit(20)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        setPreviewConcepts(shuffled.slice(0, 3) as ConceptPreview[]);
      });
  }, []);

  // Loading animation: progress bar, tips, staggered cards
  useEffect(() => {
    if (!preparing) return;

    const start = Date.now();
    submitStartedAt.current = start;
    readyRef.current = false;

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / MIN_LOADING_MS) * 100));
    }, 100);

    const tipTimer = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 3000);

    const cardTimers = [0, 300, 600].map((delay, i) =>
      window.setTimeout(() => setVisibleCards((c) => Math.max(c, i + 1)), delay)
    );

    const pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/onboard-status");
        if (!res.ok) return;
        const data = (await res.json()) as { ready?: boolean };
        if (data.ready) {
          readyRef.current = true;
        }
      } catch {
        // ignore transient poll errors
      }

      const elapsed = Date.now() - submitStartedAt.current;
      if (readyRef.current && elapsed >= MIN_LOADING_MS) {
        router.push("/me");
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(tipTimer);
      window.clearInterval(pollTimer);
      cardTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [preparing, router]);

  const background = backgroundText.trim() || backgroundChip;
  const name = nameText.trim();
  const goal = goalText.trim() || goalChip;

  // The name is optional, so its step always lets the learner through — the
  // email local part is the fallback. Background and Goal still gate.
  const canAdvance =
    step === 0
      ? background.length > 0
      : step === 1
        ? true
        : step === 2
          ? goal.length > 0
          : true;

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    if (submitting || preparing) return;
    setSubmitting(true);
    setError(null);
    setProgress(0);
    setVisibleCards(0);
    setTipIndex(0);
    setPreparing(true);

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          background,
          name,
          goal,
          role_title: "",
          answers: DIAGNOSTIC_QUESTIONS.map((q) => ({
            concept_slug: q.concept_slug,
            question: q.question,
            answer: answers[q.concept_slug] ?? "",
          })),
        }),
      });

      const data = (await res.json()) as OnboardResponse;

      if (!res.ok) {
        setPreparing(false);
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Onboard returned; mark ready so the poll/min-time gate can redirect.
      readyRef.current = true;
      const elapsed = Date.now() - submitStartedAt.current;
      if (elapsed >= MIN_LOADING_MS) {
        router.push("/me");
        router.refresh();
      }
    } catch {
      setPreparing(false);
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (preparing) {
    return (
      <main className="flex min-h-screen items-center justify-center py-12">
        <Container>
          <div className="card w-full text-center">
            <h1 className="font-heading text-3xl">Preparing your journey...</h1>

          <div className="mt-8 flex flex-col gap-3">
            {previewConcepts.map((c, i) => (
              <div
                key={c.id}
                className="rounded-sm border border-walnut bg-linen px-4 py-3 text-left transition-opacity duration-500"
                style={{
                  opacity: i < visibleCards ? 1 : 0,
                  transform:
                    i < visibleCards ? "translateY(0)" : "translateY(8px)",
                }}
              >
                <span className="font-semibold">{c.title}</span>
                <span
                  className="ml-2 rounded-sm px-2 py-0.5 font-mono text-xs uppercase tracking-wide"
                  style={{
                    backgroundColor: "var(--walnut)",
                    color: "var(--paper)",
                  }}
                >
                  {difficultyLabel(c.difficulty)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-8 h-2 w-full overflow-hidden rounded-sm"
            style={{ backgroundColor: "var(--cork)" }}
          >
            <div
              className="h-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${progress}%`,
                backgroundColor: "var(--primary)",
              }}
            />
          </div>

          <p className="mt-6 font-hand text-xl text-inkfaded">
            {TIPS[tipIndex]}
          </p>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col py-12">
      <Container className="flex flex-1 flex-col">
        <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Set up · Step {step + 1} of {STEPS.length}
        </p>

        <div className="mt-4 flex gap-2" aria-hidden="true">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`h-2.5 w-2.5 rounded-full ${
                i <= step ? "bg-primary" : "bg-bgsubtle"
              }`}
            />
          ))}
        </div>
      </header>

      <div className="flex-1">
        {step === 0 && (
          <section>
            <h1 className="text-3xl">Where are you coming from?</h1>
            <p className="mt-2 text-inkfaded">
              This lets us skip what you already know.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {BACKGROUND_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setBackgroundChip(chip)}
                  className={
                    backgroundChip === chip && !backgroundText.trim()
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                >
                  {chip}
                </button>
              ))}
            </div>

            <label className="mt-8 flex flex-col gap-1">
              <span className="text-sm font-semibold text-inkfaded">
                Or describe your background in your own words
              </span>
              <textarea
                value={backgroundText}
                onChange={(e) => setBackgroundText(e.target.value)}
                rows={3}
                className="input"
                placeholder="I'm a structural engineer who does a lot of numerical simulation…"
              />
            </label>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="text-3xl">What should we call you?</h1>
            <p className="mt-2 text-inkfaded">
              We&apos;ll use it to personalize your experience.
            </p>

            <label className="mt-8 flex flex-col gap-1">
              <span className="text-sm font-semibold text-inkfaded">
                Your name <span className="font-normal">(optional)</span>
              </span>
              <input
                type="text"
                value={nameText}
                onChange={(e) => setNameText(e.target.value)}
                className="input"
                placeholder="e.g. Priya Sharma"
                maxLength={80}
                autoComplete="name"
                // Enter advances rather than submitting a half-filled form.
                onKeyDown={(e) => {
                  if (e.key === "Enter") goNext();
                }}
              />
            </label>

            <p className="mt-2 text-sm text-inkfaded">
              Leave it blank and we&apos;ll use the first part of your email
              address instead.
            </p>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-3xl">What do you want to do with AI?</h1>
            <p className="mt-2 text-inkfaded">
              We build your path backwards from this.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {GOAL_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setGoalChip(chip)}
                  className={
                    goalChip === chip && !goalText.trim()
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                >
                  {chip}
                </button>
              ))}
            </div>

            <label className="mt-8 flex flex-col gap-1">
              <span className="text-sm font-semibold text-inkfaded">
                Or describe your goal
              </span>
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                rows={3}
                className="input"
                placeholder="I want to build a chatbot that answers questions about our internal docs…"
              />
            </label>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="text-3xl">A few quick questions to place you</h1>
            <p className="mt-2 text-inkfaded">
              Rough answers are fine. Leave one blank if you have no idea.
            </p>

            <div className="mt-6 flex flex-col gap-6">
              {DIAGNOSTIC_QUESTIONS.map((q, i) => (
                <label key={q.concept_slug} className="flex flex-col gap-2">
                  <span className="font-semibold">
                    {i + 1}. {q.question}
                  </span>
                  <textarea
                    value={answers[q.concept_slug] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.concept_slug]: e.target.value,
                      }))
                    }
                    rows={3}
                    className="input"
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="mt-6 rounded-sm bg-paperdark px-3 py-2 text-sm text-terracotta">
            {error}
          </p>
        )}
      </div>

      <footer className="mt-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0 || submitting}
          className="btn-secondary"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance}
            className="btn-primary"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || preparing}
            className="btn-primary"
          >
            {submitting ? "Setting up your path..." : "Build my path"}
          </button>
        )}
      </footer>
      </Container>
    </main>
  );
}
