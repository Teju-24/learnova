import type { GradingResult } from "@/lib/content-schema";

/** Grading returned by the API, plus the learner's updated mastery. */
export type InteractionGrading = GradingResult & {
  newMastery?: number;
};

/**
 * Called when a learner finishes an interaction. `grading` is only supplied
 * when the component already called the grading API itself (Explain does),
 * so the player must not grade it twice.
 */
export type OnComplete = (
  score: number,
  userAnswer: string,
  grading?: InteractionGrading
) => void;

/**
 * Set once the interaction must not accept another answer. A test question is
 * one attempt only, so the player locks the interaction after it has been
 * graded; inside a lesson the interaction keeps its own retry affordance.
 */
export type LockableProps = {
  locked?: boolean;
};
