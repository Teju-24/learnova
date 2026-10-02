/**
 * Adaptive question selection for the concept test.
 *
 * The test starts on the middle question of the bank and walks up or down by
 * difficulty after each answer. This module is deliberately free of React so
 * the policy can be read and tested on its own.
 *
 * TODO(difficulty): difficulty is inferred from a question's position in the
 * bank (index 0 easiest ... 4 hardest). That mapping is an assumption, not
 * data: InteractionItem carries no `difficulty` field (lib/content-schema.ts)
 * and CONCEPT_TEST_PROMPT only asks for "2 easy, 2 medium, 1 hard" without
 * requiring the generator to order them. The 44 shipped banks are all roughly
 * easy -> hard, so this holds today, but an AI-generated bank is not guaranteed
 * to. When a real per-question `difficulty` lands on the schema, replace the
 * index arithmetic in `nextAdaptiveIndex` with a lookup by difficulty; the rest
 * of the test flow is agnostic to it.
 */

/** A concept test always asks five questions, however long the bank is. */
export const TEST_LENGTH = 5;

/** The bank index an adaptive test opens on: the middle (medium) question. */
export function firstTestIndex(poolSize: number): number {
  if (poolSize <= 0) return 0;
  return Math.min(2, poolSize - 1);
}

/**
 * The next question-bank index to ask, or null when the pool is exhausted.
 *
 * `used` is the sequence so far and `current` the index just answered. A
 * correct answer moves to the nearest unused harder question, a wrong answer to
 * the nearest unused easier one; when that side is empty any unused question is
 * fair game (nearest first), so a full bank always yields a full test.
 */
export function nextAdaptiveIndex(
  used: number[],
  current: number,
  correct: boolean,
  poolSize: number
): number | null {
  const remaining: number[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    if (used.indexOf(i) === -1) remaining.push(i);
  }
  if (remaining.length === 0) return null;

  let adjacent = -1;
  for (const i of remaining) {
    if (correct ? i > current : i < current) {
      if (adjacent === -1) {
        adjacent = i;
      } else if (correct ? i < adjacent : i > adjacent) {
        adjacent = i;
      }
    }
  }
  if (adjacent !== -1) return adjacent;

  // No harder/easier question left: take the nearest unused one so a short
  // bank still reaches the full test length instead of stopping early.
  let best = remaining[0];
  for (const i of remaining) {
    const d = Math.abs(i - current);
    const bestD = Math.abs(best - current);
    if (d < bestD || (d === bestD && i < best)) best = i;
  }
  return best;
}

/**
 * Plays a whole test from a list of correctness outcomes and returns the bank
 * indices that would be asked. Used by the component step-by-step (it asks one
 * question at a time), but handy as one function in tests.
 */
export function adaptiveSequence(
  poolSize: number,
  outcomes: boolean[]
): number[] {
  const sequence = [firstTestIndex(poolSize)];
  const length = Math.min(TEST_LENGTH, poolSize);
  for (let i = 0; i < length - 1; i += 1) {
    const current = sequence[sequence.length - 1];
    const next = nextAdaptiveIndex(
      sequence,
      current,
      outcomes[i] ?? false,
      poolSize
    );
    if (next === null) break;
    sequence.push(next);
  }
  return sequence;
}
