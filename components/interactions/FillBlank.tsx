"use client";

import { useState } from "react";
import { Check, Puzzle, X } from "lucide-react";
import type { InteractionItem } from "@/lib/content-schema";
import type { LockableProps, OnComplete } from "./types";

type Props = {
  item: Extract<InteractionItem, { type: "fill_blank" }>;
  onComplete: OnComplete;
} & LockableProps;

const ACCENT = "var(--a-fill-blank)";

export default function FillBlank({ item, onComplete, locked = false }: Props) {
  const [chosen, setChosen] = useState<number | null>(null);

  const isCorrect = chosen !== null && chosen === item.correct_index;
  const parts = item.sentence.split("___");

  function choose(index: number) {
    if (chosen !== null || locked) return;
    setChosen(index);
    onComplete(index === item.correct_index ? 1 : 0, item.options[index]);
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <Puzzle size={18} />
        </span>
        <p className="font-heading text-xl">Fill in the blank</p>
      </div>

      <p className="mt-4 text-lg leading-relaxed">
        {parts[0]}
        <span
          className="mx-1 inline-block min-w-20 border-b-2 border-dashed text-center font-semibold"
          style={{
            borderColor: chosen === null ? ACCENT : isCorrect ? "var(--success)" : "var(--error)",
            color:
              chosen === null
                ? ACCENT
                : isCorrect
                  ? "var(--success)"
                  : "var(--error)",
          }}
        >
          {chosen === null ? "___" : item.options[chosen]}
        </span>
        {parts.slice(1).join("___")}
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {item.options.map((option, index) => {
          const isChosen = chosen === index;
          const isAnswer = chosen !== null && index === item.correct_index;

          let style: React.CSSProperties = {};
          if (chosen === null) {
            style = { borderColor: "var(--ink-faint)", color: "var(--ink)" };
          } else if (isAnswer) {
            style = {
              borderColor: "var(--success)",
              backgroundColor: "var(--success-soft)",
              color: "var(--ink)",
            };
          } else if (isChosen) {
            style = {
              borderColor: "var(--error)",
              backgroundColor: "var(--error-soft)",
              color: "var(--ink)",
            };
          } else {
            style = { opacity: 0.4 };
          }

          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(index)}
              disabled={chosen !== null}
              className="flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left font-semibold transition-colors"
              style={style}
            >
              {chosen !== null && isAnswer && (
                <Check size={16} className="shrink-0 text-success" strokeWidth={3} />
              )}
              {chosen !== null && isChosen && !isAnswer && (
                <X size={16} className="shrink-0 text-error" strokeWidth={3} />
              )}
              <span className="flex-1">{option}</span>
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <p
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: isCorrect ? "var(--success)" : "var(--error)" }}
        >
          {isCorrect ? (
            <Check size={15} strokeWidth={3} />
          ) : (
            <X size={15} strokeWidth={3} />
          )}
          {isCorrect
            ? "Correct."
            : `Not quite. The answer is "${item.options[item.correct_index]}".`}
        </p>
      )}
    </div>
  );
}