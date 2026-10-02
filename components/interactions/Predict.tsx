"use client";

import { useId, useState } from "react";
import { Check, MousePointerClick, X } from "lucide-react";
import type { InteractionItem } from "@/lib/content-schema";
import type { LockableProps, OnComplete } from "./types";

type Props = {
  item: Extract<InteractionItem, { type: "predict" }>;
  onComplete: OnComplete;
} & LockableProps;

const ACCENT = "var(--a-predict)";

export default function Predict({ item, onComplete, locked = false }: Props) {
  const groupName = useId();
  const [chosen, setChosen] = useState<number | null>(null);

  // `chosen` is the 0-based index of the clicked choice and `correct_index` is
  // the 0-based index of the right one, so they compare directly.
  const answered = chosen !== null;
  const isCorrect = answered && chosen === item.correct_index;

  // Clicking an option *is* the submission: there is no separate reveal step,
  // so the player can move on as soon as an attempt has been made.
  function choose(index: number) {
    if (answered || locked) return;
    setChosen(index);
    onComplete(index === item.correct_index ? 1 : 0, item.choices[index]);
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <MousePointerClick size={18} />
        </span>
        <p className="font-heading text-xl">Predict</p>
      </div>

      <p className="mt-4 text-lg">{item.question}</p>

      <div className="mt-4 flex flex-col gap-2">
        {item.choices.map((choice, index) => {
          const isPicked = chosen === index;
          const isAnswer = answered && index === item.correct_index;

          let style: React.CSSProperties = { color: "var(--ink)" };
          if (!answered) {
            style = {
              borderColor: "var(--ink-faint)",
              color: "var(--ink)",
              cursor: isPicked ? "pointer" : "pointer",
            };
          } else if (isAnswer) {
            style = {
              borderColor: "var(--success)",
              backgroundColor: "var(--success-soft)",
              color: "var(--ink)",
            };
          } else if (isPicked) {
            style = {
              borderColor: "var(--error)",
              backgroundColor: "var(--error-soft)",
              color: "var(--ink)",
            };
          } else {
            style = { opacity: 0.4 };
          }

          return (
            <label
              key={choice}
              className="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors"
              style={style}
            >
              <input
                type="radio"
                name={groupName}
                checked={isPicked}
                disabled={answered}
                onChange={() => choose(index)}
                className="accent-[var(--primary)]"
              />
              <span className="flex-1">{choice}</span>
              {answered && isAnswer && (
                <Check size={16} className="shrink-0 text-success" strokeWidth={3} />
              )}
              {answered && isPicked && !isAnswer && (
                <X size={16} className="shrink-0 text-error" strokeWidth={3} />
              )}
            </label>
          );
        })}
      </div>

      {answered && (
        <div className="mt-4 rounded-md border-l-4 px-4 py-3"
          style={{ borderLeftColor: ACCENT, backgroundColor: `${ACCENT}14` }}
        >
          <p
            className="flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: isCorrect ? "var(--success)" : "var(--error)" }}
          >
            {isCorrect ? (
              <Check size={15} strokeWidth={3} />
            ) : (
              <X size={15} strokeWidth={3} />
            )}
            {isCorrect ? "Correct." : "Not quite."}
          </p>
          <p className="mt-1 text-sm text-ink">{item.reveal}</p>
        </div>
      )}
    </div>
  );
}