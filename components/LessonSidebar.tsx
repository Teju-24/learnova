"use client";

import {
  BookMarked,
  Check,
  Lock,
  Pencil,
  X,
} from "lucide-react";
import type { InteractionItem, Timeline } from "@/lib/content-schema";
import type { ConceptNoteForPlayer } from "@/components/LessonPlayer";

type Props = {
  timeline: Timeline;
  /** Used to label sections with their real heading. */
  note: ConceptNoteForPlayer;
  currentStep: number;
  /** Indices the learner has already reached, ascending. */
  completedSteps: number[];
  open: boolean;
  onNavigate: (step: number) => void;
  onClose: () => void;
};

/** Matches the heading each interaction component already renders. */
function interactionLabel(activity: InteractionItem): string {
  switch (activity.type) {
    case "fill_blank":
      return "Fill in the blank";
    case "predict":
      return "Predict";
    case "spot_mistake":
      return "Spot the mistake";
    case "order_steps":
      return "Put these in order";
    case "drag_match":
      return "Match the terms";
    case "explain":
      return "Explain it back";
    case "code_editor":
      return "Code challenge";
    default:
      return "Activity";
  }
}

function sectionLabel(sectionId: string, note: ConceptNoteForPlayer): string {
  const deepMatch = /^deep_explanation\.(\d+)$/.exec(sectionId);
  if (deepMatch) {
    const idx = Number.parseInt(deepMatch[1], 10);
    return note.deep_explanation?.[idx]?.heading ?? sectionId;
  }
  switch (sectionId) {
    case "long_intro":
      return "Introduction";
    case "code_example":
      return "Code example";
    case "common_mistakes":
      return "Common mistakes";
    case "real_world_usage":
      return "In the real world";
    case "key_takeaways":
      return "Key takeaways";
    case "formal_definition":
      return "Formal definition";
    default:
      return sectionId;
  }
}

/**
 * Only the visible slice of a long timeline is rendered, so a 16-step lesson
 * does not put 16 rows in the sidebar.
 */
const VISIBLE_STEPS = 30;

/**
 * Jump list for a lesson the learner has already completed. It only ever
 * offers steps that have been reached, so it cannot be used to skip ahead
 * through a lesson for the first time.
 */
export default function LessonSidebar({
  timeline,
  note,
  currentStep,
  completedSteps,
  open,
  onNavigate,
  onClose,
}: Props) {
  const reached = new Set(completedSteps);
  const first = Math.max(0, Math.min(currentStep, timeline.length - 1) - 10);
  const last = Math.min(timeline.length, first + VISIBLE_STEPS);

  return (
    <>
      {/* Mobile scrim — desktop keeps the sidebar in the flow instead. */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: "rgba(30,41,59,0.35)" }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="lesson-contents"
        aria-label="Lesson sections"
        className={[
          // Mobile: fixed overlay that slides in from the left.
          "fixed inset-y-0 left-0 z-40 w-[240px] transform transition-transform duration-200 md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: in the flow when open, out of it when closed.
          open ? "md:relative md:inset-auto md:flex" : "md:hidden",
          "shrink-0 flex-col border-r border-bgcard",
        ].join(" ")}
        style={{ backgroundColor: "var(--bg-card)" }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-bgsubtle px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkfaint">
            Contents
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-inkfaint transition-colors hover:bg-bgsubtle hover:text-ink"
            aria-label="Close contents"
          >
            <X size={16} />
          </button>
        </div>

        <ol className="flex-1 overflow-y-auto py-2">
          {timeline.slice(first, last).map((item, offset) => {
            const index = first + offset;
            const isCurrent = index === currentStep;
            const isReached = reached.has(index);
            // Not yet reached: dimmed, and not a link.
            const isDisabled = !isReached && !isCurrent;

            const label =
              item.type === "section"
                ? sectionLabel(item.section_id, note)
                : interactionLabel(item.activity);

            const Icon = item.type === "section" ? BookMarked : Pencil;

            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onNavigate(index);
                    onClose();
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    isCurrent ? "" : isDisabled ? "" : "hover:bg-bgsubtle"
                  }`}
                  style={{
                    backgroundColor: isCurrent
                      ? "var(--primary-soft)"
                      : "transparent",
                    color: isDisabled ? "var(--ink-faint)" : "var(--ink)",
                    opacity: isDisabled ? 0.6 : 1,
                    cursor: isDisabled ? "default" : "pointer",
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                      isCurrent
                        ? "text-primary"
                        : isReached
                          ? "bg-success-soft text-success"
                          : "bg-bgsubtle text-inkfaint"
                    }`}
                    style={{ backgroundColor: isCurrent ? "rgba(91,79,233,0.15)" : undefined }}
                  >
                    {isCurrent ? (
                      <Icon size={13} />
                    ) : isReached ? (
                      <Check size={13} strokeWidth={3} />
                    ) : isDisabled ? (
                      <Lock size={12} />
                    ) : (
                      <Icon size={13} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {isCurrent && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </>
  );
}