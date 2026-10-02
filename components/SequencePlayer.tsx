"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { InteractionItem, InteractionSequence } from "@/lib/content-schema";
import CalculatorCode from "./CalculatorCode";
import DragMatch from "./interactions/DragMatch";
import Explain from "./interactions/Explain";
import FillBlank from "./interactions/FillBlank";
import OrderSteps from "./interactions/OrderSteps";
import Predict from "./interactions/Predict";
import SpotMistake from "./interactions/SpotMistake";
import type { InteractionGrading, OnComplete } from "./interactions/types";

type Props = {
  sequence: InteractionSequence;
  conceptId: number;
  tier: string;
  conceptSlug?: string;
  /** Called once when every interaction in the sequence has been answered. */
  onLessonComplete?: () => void;
};

const INTERACTION_TYPES = new Set([
  "fill_blank",
  "drag_match",
  "order_steps",
  "predict",
  "spot_mistake",
  "explain",
]);

const DETERMINISTIC_TYPES = new Set([
  "fill_blank",
  "drag_match",
  "order_steps",
  "predict",
  "spot_mistake",
]);

function isInteraction(item: InteractionItem): boolean {
  return INTERACTION_TYPES.has(item.type);
}

export default function SequencePlayer({
  sequence,
  conceptId,
  tier,
  conceptSlug,
  onLessonComplete,
}: Props) {
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const firedComplete = useRef(false);

  const interactionIndexes = sequence
    .map((item, index) => (isInteraction(item) ? index : -1))
    .filter((index) => index >= 0);

  const doneCount = interactionIndexes.filter((index) =>
    completed.has(index)
  ).length;
  const allComplete =
    interactionIndexes.length > 0 && doneCount === interactionIndexes.length;

  useEffect(() => {
    if (!allComplete || firedComplete.current) return;
    firedComplete.current = true;
    onLessonComplete?.();
    window.dispatchEvent(new CustomEvent("learnova:lesson-complete"));
  }, [allComplete, onLessonComplete]);

  function fireMasteryUpdate(mastery: number) {
    if (!conceptSlug) return;
    window.dispatchEvent(
      new CustomEvent("learnova:mastery-update", {
        detail: { conceptSlug, mastery },
      })
    );
  }

  function persistDeterministicMastery(score: number) {
    void fetch("/api/mastery-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept_id: conceptId, score }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { new_mastery?: number };
        if (typeof data.new_mastery === "number") {
          fireMasteryUpdate(data.new_mastery);
        }
      })
      .catch(() => {
        // Non-blocking
      });
  }

  function handleComplete(
    index: number,
    item: InteractionItem,
    userAnswer: string,
    score: number,
    grading?: InteractionGrading
  ) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setNotice(null);

    if (grading) {
      if (typeof grading.newMastery === "number") {
        fireMasteryUpdate(grading.newMastery);
      }
      return;
    }

    if (DETERMINISTIC_TYPES.has(item.type)) {
      persistDeterministicMastery(score);
      return;
    }

    void userAnswer;
  }

  function renderItem(item: InteractionItem, index: number) {
    const done: OnComplete = (score, answer, grading) =>
      handleComplete(index, item, answer, score, grading);

    switch (item.type) {
      case "comfort_opener":
        return (
          <section key={index} className="card">
            <p className="font-hand text-2xl leading-snug">{item.content}</p>
          </section>
        );

      case "key_idea":
        return (
          <section
            key={index}
            className="rounded-r-sm border-l-4 border-terracotta bg-linen px-6 py-8 text-center"
            style={{ borderLeftColor: "var(--terracotta)" }}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-inkfaded">
              Key idea
            </p>
            <p className="mt-3 font-heading text-2xl">{item.content}</p>
          </section>
        );

      case "analogy":
        return (
          <section key={index} className="card">
            <p className="text-sm font-semibold uppercase tracking-wide text-inkfaded">
              In your world
            </p>
            <p className="mt-2 text-lg">{item.content}</p>
          </section>
        );

      case "python_code":
        return (
          <section key={index} className="card">
            <p className="text-sm font-semibold uppercase tracking-wide text-inkfaded">
              Code
            </p>
            <div className="mt-3">
              <CalculatorCode
                code={item.code}
                universal_explanation={item.universal_explanation}
                symbols={item.symbols}
              />
            </div>
          </section>
        );

      case "fill_blank":
        return <FillBlank key={index} item={item} onComplete={done} />;

      case "drag_match":
        return <DragMatch key={index} item={item} onComplete={done} />;

      case "order_steps":
        return <OrderSteps key={index} item={item} onComplete={done} />;

      case "predict":
        return <Predict key={index} item={item} onComplete={done} />;

      case "spot_mistake":
        return <SpotMistake key={index} item={item} onComplete={done} />;

      case "explain":
        return (
          <Explain
            key={index}
            item={item}
            conceptId={conceptId}
            tier={tier}
            sequenceIndex={index}
            onComplete={done}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-inkfaded">
          {doneCount} of {interactionIndexes.length} activities done
        </p>
        <div
          className="h-2 w-32 overflow-hidden rounded-sm"
          style={{ backgroundColor: "var(--cork)" }}
        >
          <div
            className="h-full"
            style={{
              width: `${
                interactionIndexes.length === 0
                  ? 0
                  : (doneCount / interactionIndexes.length) * 100
              }%`,
              backgroundColor: "var(--moss)",
            }}
          />
        </div>
      </div>

      {sequence.map((item, index) => (
        <div key={index}>{renderItem(item, index)}</div>
      ))}

      {notice && (
        <p
          className="rounded-sm px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--paper-dark)",
            color: "var(--terracotta)",
          }}
        >
          {notice}
        </p>
      )}

      {allComplete && (
        <section
          className="card text-center"
          style={{ borderColor: "var(--moss)" }}
        >
          <p className="font-hand text-3xl">Lesson complete</p>
          <p className="mt-2 text-inkfaded">
            Your mastery for this concept moved. The next step is waiting.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/me" className="btn-primary">
              Back to my path
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
