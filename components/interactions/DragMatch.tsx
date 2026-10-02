"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, GripVertical, X } from "lucide-react";
import type { InteractionItem } from "@/lib/content-schema";
import { seededShuffle } from "@/lib/shuffle";
import type { LockableProps, OnComplete } from "./types";

type Props = {
  item: Extract<InteractionItem, { type: "drag_match" }>;
  onComplete: OnComplete;
} & LockableProps;

const ACCENT = "var(--a-drag-match)";

export default function DragMatch({
  item,
  onComplete,
  locked = false,
}: Props) {
  const termOrder = useMemo(
    () => seededShuffle(item.pairs.map((_, i) => i), `terms:${JSON.stringify(item.pairs)}`),
    [item.pairs]
  );
  const defOrder = useMemo(
    () => seededShuffle(item.pairs.map((_, i) => i), `defs:${JSON.stringify(item.pairs)}`),
    [item.pairs]
  );

  // definitionIndex -> original term index
  const [matches, setMatches] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overDef, setOverDef] = useState<number | null>(null);

  const allMatched = defOrder.every((d) => matches[d] !== undefined);

  // In a test the question is one attempt, so a locked interaction cannot be
  // reset back into an answerable state. Inside a lesson the Reset retry stays
  // available.
  const lockedRevealed = revealed || locked;

  const correctCount = defOrder.filter((d) => matches[d] === d).length;
  const score = correctCount / item.pairs.length;

  function assign(defIndex: number, termIndex: number) {
    if (locked) return;
    setMatches((prev) => {
      const next = { ...prev };
      // A term can only sit in one slot.
      for (const key of Object.keys(next)) {
        if (next[Number(key)] === termIndex) delete next[Number(key)];
      }
      next[defIndex] = termIndex;
      return next;
    });
  }

  function reveal() {
    if (!allMatched || lockedRevealed) return;
    setRevealed(true);
    onComplete(score, JSON.stringify(matches));
  }

  function reset() {
    if (locked) return;
    setMatches({});
    setRevealed(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <ArrowRightLeft size={18} />
        </span>
        <p className="font-heading text-xl">Match the terms</p>
      </div>
      <p className="mt-1 text-sm text-inkmuted">
        Drag each term onto the definition it belongs to.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          {termOrder.map((termIndex) => {
            const slot = Object.keys(matches).find(
              (k) => matches[Number(k)] === termIndex
            );
            const isDragging = dragging === termIndex;
            const isPlaced = slot !== undefined;
            const isRight = revealed && slot !== undefined && Number(slot) === termIndex;
            const isWrong = revealed && isPlaced && !isRight;
            return (
              <div
                key={termIndex}
                draggable={!lockedRevealed}
                onDragStart={() => setDragging(termIndex)}
                onDragEnd={() => setDragging(null)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 select-none transition-colors ${
                  isDragging ? "opacity-40" : ""
                }`}
                style={{
                  borderColor: isRight
                    ? "var(--success)"
                    : isWrong
                      ? "var(--error)"
                      : isPlaced
                        ? "var(--primary)"
                        : "var(--bgsubtle, #F0EADC)",
                  backgroundColor: isRight
                    ? "var(--success-soft)"
                    : isWrong
                      ? "var(--error-soft)"
                      : "var(--bg-card)",
                  cursor: lockedRevealed ? "default" : "grab",
                }}
              >
                <GripVertical size={15} className="shrink-0 text-inkfaint" aria-hidden="true" />
                <span className="flex-1 font-semibold">
                  {item.pairs[termIndex].term}
                </span>
                {isRight && <Check size={15} className="shrink-0 text-success" strokeWidth={3} />}
                {isWrong && <X size={15} className="shrink-0 text-error" strokeWidth={3} />}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          {defOrder.map((defIndex) => {
            const termIndex = matches[defIndex];
            const isOver = overDef === defIndex;
            const isRight = revealed && termIndex === defIndex;
            const isWrong = revealed && termIndex !== defIndex;

            return (
              <div
                key={defIndex}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!lockedRevealed) setOverDef(defIndex);
                }}
                onDragLeave={() => setOverDef(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (lockedRevealed || dragging === null) return;
                  assign(defIndex, dragging);
                  setDragging(null);
                  setOverDef(null);
                }}
                className="rounded-md border-2 border-dashed px-3 py-2 transition-colors"
                style={{
                  borderColor: isRight
                    ? "var(--success)"
                    : isWrong
                      ? "var(--error)"
                      : isOver
                        ? "var(--primary)"
                        : "var(--bgsubtle, #F0EADC)",
                  backgroundColor: isRight
                    ? "var(--success-soft)"
                    : isWrong
                      ? "var(--error-soft)"
                      : isOver
                        ? "var(--primary-soft)"
                        : termIndex !== undefined
                          ? "var(--bg-card)"
                          : "transparent",
                }}
              >
                <p className="text-sm">{item.pairs[defIndex].definition}</p>
                {termIndex !== undefined && (
                  <p
                    className="mt-1 flex items-center gap-1 font-semibold"
                    style={{ color: isWrong ? "var(--error)" : "var(--ink)" }}
                  >
                    {isWrong && <X size={13} strokeWidth={3} />}
                    {item.pairs[termIndex].term}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={reveal}
          disabled={!allMatched || lockedRevealed}
          className="btn-primary"
        >
          Check matches
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

      {revealed && (
        <p
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: score === 1 ? "var(--success)" : "var(--error)" }}
        >
          {score === 1 ? (
            <Check size={15} strokeWidth={3} />
          ) : (
            <X size={15} strokeWidth={3} />
          )}
          {correctCount} of {item.pairs.length} pairs matched correctly.
        </p>
      )}
    </div>
  );
}