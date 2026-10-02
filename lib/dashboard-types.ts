import type { Tier } from "@/lib/tier";

/**
 * One card in the dashboard's "Your path" timeline. Lives outside the client
 * components so the server data loader and the presentational components can
 * share it without importing each other.
 */
export type PathViewItem = {
  key: string;
  conceptId: number;
  title: string;
  why: string;
  tier: Tier;
  tierLabelText: string;
  score: number;
  /**
   * - mastered: the test was passed with enough score to count as mastered
   * - completed: the lesson was finished (timeline done or test passed) but
   *   mastery is still below the threshold
   * - current: where the learner is now — the one concept the car sits above
   * - upcoming: unlocked by its prerequisites, not started
   * - locked: prerequisites not met yet
   */
  status: "mastered" | "completed" | "current" | "upcoming" | "locked";
  slug: string;
};
