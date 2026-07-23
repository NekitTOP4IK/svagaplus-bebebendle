/** Minimum total votes (likes+dislikes) for a scran to enter competitive pairing. */
export const MIN_COMPETITIVE_VOTES = 15;

/** Number of rounds in a competitive daily. */
export const COMPETITIVE_ROUNDS = 10;

/** Base points before difficulty multiplier. */
export const POINTS_BASE = 100;

/** Numerator for difficulty multiplier: mult = clamp(K / max(Δ, 1), MIN, MAX). */
export const POINTS_K = 12;

export const POINTS_MIN_MULT = 1;
export const POINTS_MAX_MULT = 8;

/**
 * Difficulty bands by round number (1-indexed).
 * Δ is percentage points (absolute difference of like rates × 100).
 */
export const DIFFICULTY_BANDS = [
  { roundStart: 1, roundEnd: 2, minDelta: 12, maxDelta: 25 },
  { roundStart: 3, roundEnd: 4, minDelta: 7, maxDelta: 12 },
  { roundStart: 5, roundEnd: 7, minDelta: 3, maxDelta: 7 },
  { roundStart: 8, roundEnd: 10, minDelta: 1, maxDelta: 3 },
] as const;
