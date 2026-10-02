"use client";

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Lightbulb,
  Loader2,
  Send,
  X,
} from "lucide-react";
import {
  GradingResultSchema,
  type CodeEditor as CodeEditorActivity,
} from "@/lib/content-schema";
import type { InteractionGrading, LockableProps, OnComplete } from "./types";

type Props = {
  item: CodeEditorActivity;
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

const ACCENT = "var(--a-code-editor)";

/** Indent inserted by Tab and by auto-indent after a block opener. */
const INDENT = "    ";

/** Textarea padding-left, so the code clears the gutter. */
const GUTTER_WIDTH = 40;

const PAD_TOP = 12;

/**
 * Shared by the gutter and the textarea so line numbers line up with the code
 * exactly. Any change here has to apply to both.
 */
const CODE_TEXT_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  lineHeight: 1.6,
  paddingTop: PAD_TOP,
  margin: 0,
  border: 0,
};

const VERDICT_COLOR: Record<
  GradingResultLike["verdict"],
  { text: string; background: string }
> = {
  correct: { text: "var(--success)", background: "var(--success-soft)" },
  partial: { text: "var(--warning)", background: "var(--warning-soft)" },
  wrong: { text: "var(--error)", background: "var(--error-soft)" },
};

const VERDICT_ICON: Record<GradingResultLike["verdict"], typeof Check> = {
  correct: Check,
  partial: AlertTriangle,
  wrong: X,
};

const VERDICT_LABEL: Record<GradingResultLike["verdict"], string> = {
  correct: "Correct",
  partial: "Partially correct",
  wrong: "Not quite",
};

/** Mirrors GradingResultSchema; declared here to key the maps above. */
type GradingResultLike = {
  verdict: "correct" | "partial" | "wrong";
};

/** How long the copy button shows its confirmation. */
const COPIED_MS = 1500;

/**
 * Lines that actually contain something. Blank lines are what a starter snippet
 * or a stray Enter leaves behind, so they should not satisfy a line minimum.
 */
function countWrittenLines(value: string): number {
  return value.split("\n").filter((line) => line.trim() !== "").length;
}

/** A read-only code listing with its own gutter, used for the reference. */
function CodeListing({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.split("\n"), [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Clipboard denied or unavailable: nothing to recover from here.
    }
  }

  return (
    <div
      className="mt-2 overflow-hidden rounded-lg"
      style={{ border: "1.5px solid var(--ink-faint)", backgroundColor: "var(--bg-code)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: "1px solid rgba(148,163,184,0.25)" }}
      >
        <span className="font-mono text-xs" style={{ color: "#64748B" }}>
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 font-mono text-xs"
          style={{ color: copied ? ACCENT : "#94A3B8" }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex" style={{ maxHeight: 320, overflowY: "auto" }}>
        <pre
          aria-hidden="true"
          className="shrink-0 select-none text-right"
          style={{
            ...CODE_TEXT_STYLE,
            width: GUTTER_WIDTH,
            paddingRight: 10,
            color: "#64748B",
            backgroundColor: "rgba(15,23,42,0.55)",
          }}
        >
          {lines.map((_, index) => index + 1).join("\n")}
        </pre>
        <pre
          className="min-w-0 flex-1 whitespace-pre"
          style={{ ...CODE_TEXT_STYLE, color: "#E2E8F0", paddingRight: 12 }}
        >
          {code}
        </pre>
      </div>
    </div>
  );
}

export default function CodeEditor({
  item,
  conceptId,
  tier,
  sequenceIndex,
  onComplete,
  locked = false,
}: Props) {
  const [code, setCode] = useState(item.starter_code);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grading, setGrading] = useState<InteractionGrading | null>(null);
  // Set when the learner confirms they solved it. The interaction is finished at
  // that point, even though the grading call already happened.
  const [accepted, setAccepted] = useState(false);

  const gutterRef = useRef<HTMLPreElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => code.split("\n"), [code]);
  const requiredLines = item.min_lines ?? 3;
  const enoughLines = countWrittenLines(code) >= requiredLines;
  const finished = grading !== null;
  const isLocked = locked || accepted;

  function setCodeAt(next: string, caret: number) {
    setCode(next);
    // Restore the caret after React has written the new value.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.selectionStart = caret;
      el.selectionEnd = caret;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isLocked) return;
    const el = event.currentTarget;
    const { selectionStart, selectionEnd, value } = el;

    if (event.key === "Tab") {
      event.preventDefault();
      const next = value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd);
      setCodeAt(next, selectionStart + INDENT.length);
      return;
    }

    if (event.key === "Enter") {
      if (selectionStart !== selectionEnd) return;
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      // Only after a block opener: a bare newline keeps the current indent.
      if (!currentLine.trimEnd().endsWith(":")) return;
      event.preventDefault();
      const indent = /^\s*/.exec(currentLine)?.[0] ?? "";
      const insert = "\n" + indent + INDENT;
      const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
      setCodeAt(next, selectionStart + insert.length);
    }
  }

  function syncGutterScroll() {
    const el = textareaRef.current;
    if (el && gutterRef.current) {
      gutterRef.current.scrollTop = el.scrollTop;
    }
  }

  async function copyEditor() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Clipboard denied or unavailable.
    }
  }

  async function submit() {
    if (submitting || isLocked || !enoughLines) return;
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
          interaction_type: "code_editor",
          question: item.prompt,
          // The reference goes to the grader too, so it can tell a learner who
          // solved a different-but-valid approach from one who missed the point.
          rubric: `${item.rubric}\n\nReference solution:\n${item.reference_code}`,
          answer: code,
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

      setGrading({ ...parsed.data, newMastery: data.new_mastery });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function accept() {
    if (!grading || accepted) return;
    setAccepted(true);
    // Confirming a not-quite-right answer still counts, but not as a full pass.
    onComplete(grading.verdict === "correct" ? 1 : 0.5, code, grading);
  }

  function revise() {
    setGrading(null);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const verdict = grading?.verdict ?? null;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
        >
          <Code2 size={18} />
        </span>
        <p
          className="font-heading text-sm font-bold uppercase tracking-widest"
          style={{ color: ACCENT }}
        >
          Code challenge
        </p>
      </div>

      <p className="mt-4 text-lg">{item.prompt}</p>
      {item.min_lines ? (
        <p className="mt-2 text-sm text-inkmuted">Write at least {item.min_lines} lines.</p>
      ) : null}

      {/* Editor */}
      <div
        className="mt-4 overflow-hidden rounded-lg"
        style={{ border: "1.5px solid var(--ink-faint)", backgroundColor: "var(--bg-code)" }}
      >
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{ borderBottom: "1px solid rgba(148,163,184,0.25)" }}
        >
          <span className="font-mono text-xs" style={{ color: "#64748B" }}>
            main.py
          </span>
          <button
            type="button"
            onClick={copyEditor}
            className="flex items-center gap-1 font-mono text-xs"
            style={{ color: copied ? ACCENT : "#94A3B8" }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="flex" style={{ backgroundColor: "var(--bg-code)" }}>
          <pre
            ref={gutterRef}
            aria-hidden="true"
            className="shrink-0 select-none overflow-hidden text-right"
            style={{
              ...CODE_TEXT_STYLE,
              width: GUTTER_WIDTH,
              paddingRight: 10,
              color: "#64748B",
              backgroundColor: "rgba(15,23,42,0.55)",
            }}
          >
            {lines.map((_, index) => index + 1).join("\n")}
          </pre>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncGutterScroll}
            onClick={syncGutterScroll}
            disabled={isLocked}
            aria-label="Python code editor"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            className="min-w-0 flex-1 resize-none bg-transparent outline-none"
            style={{
              ...CODE_TEXT_STYLE,
              color: "#E2E8F0",
              paddingLeft: GUTTER_WIDTH,
              paddingRight: 12,
              paddingBottom: PAD_TOP,
              minHeight: 240,
              maxHeight: 480,
              overflowY: "auto",
              caretColor: ACCENT,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      {!finished && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={isLocked || submitting || !enoughLines}
            className="btn-primary"
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Grading…
              </>
            ) : (
              <>
                <Send size={15} /> Check my code
              </>
            )}
          </button>
          <span className="text-sm text-inkmuted">
            {enoughLines
              ? `${countWrittenLines(code)} written line${countWrittenLines(code) === 1 ? "" : "s"}`
              : `at least ${requiredLines} line${requiredLines === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      {/* Feedback */}
      {grading && verdict && (
        <div
          className="mt-5 rounded-md border-l-4 px-4 py-3"
          style={{
            borderLeftColor: VERDICT_COLOR[verdict].text,
            backgroundColor: VERDICT_COLOR[verdict].background,
          }}
        >
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = VERDICT_ICON[verdict];
              return <Icon size={18} style={{ color: VERDICT_COLOR[verdict].text }} />;
            })()}
            <p
              className="text-sm font-bold uppercase tracking-wide"
              style={{ color: VERDICT_COLOR[verdict].text }}
            >
              {VERDICT_LABEL[verdict]} · {Math.round(grading.score * 100)}%
            </p>
          </div>
          <p className="mt-2 text-sm text-ink">{grading.reason}</p>
        </div>
      )}

      {/* Reference solution */}
      {grading && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-inkmuted">
            <Lightbulb size={13} /> What a reference solution looks like
          </p>
          <CodeListing code={item.reference_code} label="reference.py" />
          <p className="mt-2 text-sm text-inkmuted">
            Compare your code to this reference. Did you solve the same problem?
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={accept} disabled={accepted} className="btn-secondary">
              {accepted ? "Recorded" : "Yes, I did"}
            </button>
            <button
              type="button"
              onClick={revise}
              disabled={accepted}
              className="btn-secondary"
            >
              No, let me revise
            </button>
          </div>
        </div>
      )}
    </div>
  );
}