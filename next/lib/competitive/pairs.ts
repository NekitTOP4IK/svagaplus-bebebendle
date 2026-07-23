/**
 * Pure pair helpers for competitive daily generation and validation.
 */

import { DIFFICULTY_BANDS } from "./constants";
import { likesPct } from "./scoring";

/** Canonical unordered pair key: `${minId}:${maxId}`. */
export function pairKey(idA: number, idB: number): string {
  const lo = Math.min(idA, idB);
  const hi = Math.max(idA, idB);
  return `${lo}:${hi}`;
}

export type DifficultyBand = Readonly<{
  minDelta: number;
  maxDelta: number;
}>;

/**
 * Difficulty band for a 1-indexed round number (1..COMPETITIVE_ROUNDS).
 * Throws if roundNumber is out of range.
 */
export function bandForRound(roundNumber: number): DifficultyBand {
  const band = DIFFICULTY_BANDS.find(
    (b) => roundNumber >= b.roundStart && roundNumber <= b.roundEnd,
  );
  if (!band) {
    throw new Error(
      `bandForRound: round ${roundNumber} is outside configured difficulty bands`,
    );
  }
  return { minDelta: band.minDelta, maxDelta: band.maxDelta };
}

/** Inclusive check: min ≤ delta ≤ max. */
export function isDeltaInBand(
  delta: number,
  min: number,
  max: number,
): boolean {
  return delta >= min && delta <= max;
}

/**
 * Whether two scrans can form a competitive pair based on like rates.
 * Equal percentages are rejected (no correct answer).
 */
export function canPair(
  likesA: number,
  dislikesA: number,
  likesB: number,
  dislikesB: number,
): boolean {
  const pctA = likesPct(likesA, dislikesA);
  const pctB = likesPct(likesB, dislikesB);
  return pctA !== pctB;
}

/**
 * Assert like percentages differ. Throws when equal so generator cannot
 * emit a tied pair.
 */
export function assertUnequalPct(
  likesA: number,
  dislikesA: number,
  likesB: number,
  dislikesB: number,
): void {
  if (!canPair(likesA, dislikesA, likesB, dislikesB)) {
    throw new Error(
      "assertUnequalPct: like percentages are equal; pair is not allowed",
    );
  }
}
