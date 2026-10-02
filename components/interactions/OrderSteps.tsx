"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, ListOrdered, X } from "lucide-react";
import type { InteractionItem } from "@/lib/content-schema";
import { seededShuffle } from "@/lib/shuffle";
import type { LockableProps, OnComplete } from "./types";

type Props = {
  item: Extract<InteractionItem, { type: "order_steps" }>;
  onComplete: OnComplete;
} & LockableProps;

const ACCENT = "var(--a-order-steps)";

export default function OrderSteps({
  item,
  onComplete,
  locked = false,
}: Props) {
  const [order, setOrder] = useState<number[]>(() =>
    seededShuffle(
      item.items.map((_, i) => i),
      `steps:${JSON.stringify(item.items)}`
    )
  );
  const [submitted, setSubmitted] = useState(false);

  // In a test the question is one attempt, so a locked interaction cannot be
  // reset back into an answerable state. Inside a lesson the Reset retry
  // stays available.
  const lockedSubmitted = submitted || locked;

  const correctPositions = useMemo(
    () => order.filter((value, position) => value === item.correct_order[position])
      .length,
    [order, item.correct_order]
  );

  const score = correctPositions / item.items.length;

  function move(index: number, direction: -1 | 1) {
    if (lockedSubmitted) return;
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = prev.slice();
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  }

  function submit() {
    if (lockedSubmitted) return;
    setSubmitted(true);
    onComplete(score, JSON.stringify(order));
  }

  function reset() {
    if (locked) return;
    setOrder(seededShuffle(item.items.map((_, i) => i), `steps-retry:${JSON.stringify(item.items)}`));
    setSubmitted(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <ListOrdered size={18} />
        </span>
        <p className="font-heading text-xl">Put these in order</p>
      </div>
      <p className="mt-1 text-sm text-inkmuted">
        Use the arrows until the sequence makes sense.
      </p>

      <ol className="mt-4 flex flex-col gap-2">
        {order.map((originalIndex, position) => {
          const isRight = submitted && originalIndex === item.correct_order[position];
          const isWrong = submitted && !isRight;

          return (
            <li
              key={originalIndex}
              className="flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors"
              style={{
                borderColor: isRight
                  ? "var(--success)"
                  : isWrong
                    ? "var(--error)"
                    : "var(--bgsubtle, #F0EADC)",
                backgroundColor: isRight
                  ? "var(--success-soft)"
                  : isWrong
                    ? "var(--error-soft)"
                    : "var(--bg-card)",
              }}
            >
              <GripVertical size={16} className="shrink-0 text-inkfaint" aria-hidden="true" />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bgsubtle font-mono text-xs font-semibold text-inkmuted">
                {position + 1}
              </span>
              <span className="flex-1">{item.items[originalIndex]}</span>
              {isRight && <Check size={16} className="shrink-0 text-success" strokeWidth={3} />}
              {isWrong && <X size={16} className="shrink-0 text-error" strokeWidth={3} />}
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(position, -1)}
                  disabled={submitted || position === 0}
                  aria-label="Move up"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-bgsubtle text-inkmuted transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(position, 1)}
                  disabled={submitted || position === order.length - 1}
                  aria-label="Move down"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-bgsubtle text-inkmuted transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  <ChevronDown size={15} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={lockedSubmitted}
          className="btn-primary"
        >
          Check order
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={locked}
          className="btn-secondary"
        >
          Reset
        </button>
      </div>

      {submitted && (
        <p
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: score === 1 ? "var(--success)" : "var(--error)" }}
        >
          {score === 1 ? (
            <Check size={15} strokeWidth={3} />
          ) : (
            <X size={15} strokeWidth={3} />
          )}
          {correctPositions} of {item.items.length} steps in the right place.
        </p>
      )}
    </div>
  );
}