"use client";

import { useState } from "react";
import { Check, Terminal, X } from "lucide-react";
import type { InteractionItem } from "@/lib/content-schema";
import type { LockableProps, OnComplete } from "./types";

type Props = {
  item: Extract<InteractionItem, { type: "spot_mistake" }>;
  onComplete: OnComplete;
} & LockableProps;

const ACCENT = "var(--a-spot-mistake)";

export default function SpotMistake({
  item,
  onComplete,
  locked = false,
}: Props) {
  const [clicked, setClicked] = useState<number | null>(null);

  const lines = item.code.split("\n");
  // `wrong_line` is 1-indexed in the content, matching the line numbers this
  // component displays, so the clicked number and wrong_line compare directly.
  // Clamp in case the content ran past the end of the snippet.
  const wrongLine = Math.min(Math.max(item.wrong_line, 1), lines.length);

  const isCorrect = clicked !== null && clicked === wrongLine;

  // `line` is the 1-indexed line number shown to the learner.
  function choose(line: number) {
    if (clicked !== null || locked) return;
    setClicked(line);
    onComplete(line === wrongLine ? 1 : 0, String(line));
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <Terminal size={18} />
        </span>
        <p className="font-heading text-xl">Spot the mistake</p>
      </div>
      <p className="mt-1 text-sm text-inkmuted">
        Click the line that is wrong.
      </p>

      <div
        className="mt-4 overflow-x-auto rounded-md p-3"
        style={{
          backgroundColor: "var(--bg-code)",
          color: "#E2E8F0",
        }}
      >
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isAnswer = clicked !== null && lineNumber === wrongLine;
          const isPicked = clicked === lineNumber;

          return (
            <button
              key={`${index}-${line}`}
              type="button"
              onClick={() => choose(lineNumber)}
              disabled={clicked !== null}
              className="flex w-full gap-3 px-1 text-left font-mono text-sm transition-colors"
              style={{
                backgroundColor: isAnswer
                  ? "rgba(16,185,129,0.18)"
                  : isPicked
                    ? "rgba(239,68,68,0.18)"
                    : "transparent",
                borderLeft: `3px solid ${
                  isAnswer
                    ? "var(--success)"
                    : isPicked
                      ? "var(--error)"
                      : "transparent"
                }`,
                cursor: clicked === null ? "pointer" : "default",
              }}
            >
              <span className="w-6 shrink-0 select-none text-right text-slate-500">
                {lineNumber}
              </span>
              <span className="whitespace-pre">
                {clicked !== null && isAnswer && isPicked
                  ? `✓ ${line}`
                  : line || " "}
              </span>
            </button>
          );
        })}
      </div>

      {clicked !== null && (
        <div
          className="mt-4 rounded-md border-l-4 px-4 py-3"
          style={{
            borderLeftColor: isCorrect ? "var(--success)" : "var(--error)",
            backgroundColor: isCorrect
              ? "var(--success-soft)"
              : "var(--error-soft)",
          }}
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
            {isCorrect
              ? `Correct — line ${wrongLine} was the problem.`
              : `Not quite — the mistake is on line ${wrongLine}.`}
          </p>
          <p className="mt-1 text-sm text-ink">{item.explanation}</p>
        </div>
      )}
    </div>
  );
}