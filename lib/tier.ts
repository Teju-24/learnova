export type Tier = "beginner" | "intermediate" | "advanced";

/** Mastery at or above this counts as a completed concept. */
export const MASTERED_AT = 0.7;

/**
 * How many concepts the learner has completed. Shared by the dashboard, the
 * feedback checkpoint trigger, and the feedback route itself so the three can
 * never disagree about the number shown to a learner.
 */
export function countMasteredConcepts(
  mastery: Record<string, number> | null | undefined
): number {
  return Object.values(mastery ?? {}).reduce(
    (total, score) =>
      typeof score === "number" && score >= MASTERED_AT ? total + 1 : total,
    0
  );
}

const VALID_TIERS: Tier[] = ["beginner", "intermediate", "advanced"];

/**
 * The tier of the concept note / interactions that will actually be used.
 * Advanced content exists for only some concepts, so callers that need a
 * guaranteed row should walk `tierFallbackChain` rather than assume the
 * requested tier is present.
 */
export function resolveTier(tier: string): Tier {
  return VALID_TIERS.includes(tier as Tier) ? (tier as Tier) : "beginner";
}

/**
 * Tiers to try in order when the requested tier has no content, ending at
 * beginner. Advanced falls back to intermediate before beginner so a concept
 * without an advanced note still serves the richest material available.
 */
export function tierFallbackChain(tier: Tier): Tier[] {
  const index = VALID_TIERS.indexOf(tier);
  return VALID_TIERS.slice(0, index + 1).reverse();
}

export function masteryToTier(mastery: number | undefined): Tier {
  const m = mastery ?? 0;
  if (m >= 0.7) return "advanced";
  if (m >= 0.4) return "intermediate";
  return "beginner";
}

export function tierLabel(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function tierColor(tier: Tier): string {
  if (tier === "advanced") return "var(--moss)";
  if (tier === "intermediate") return "var(--terracotta)";
  return "var(--walnut)";
}
