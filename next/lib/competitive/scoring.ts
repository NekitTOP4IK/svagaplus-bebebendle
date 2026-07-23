/**
 * Pure competitive scoring helpers.
 *
 * Δ (deltaPp) is in percentage points on a 0–100 scale:
 * abs(likesPctA − likesPctB) × 100.
 *
 * Points formula (correct only):
 *   multiplier = clamp(POINTS_K / max(Δ, 1), POINTS_MIN_MULT, POINTS_MAX_MULT)
 *   points     = round(POINTS_BASE * multiplier)
 */

import {
  POINTS_BASE,
  POINTS_K,
  POINTS_MAX_MULT,
  POINTS_MIN_MULT,
} from "./constants";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Like rate in [0, 1]. Returns 0 when there are no votes. */
export function likesPct(likes: number, dislikes: number): number {
  const total = likes + dislikes;
  if (total === 0) return 0;
  return likes / total;
}

/**
 * Absolute difference of like rates as percentage points (0–100 scale).
 * Example: 70% vs 50% → 20.
 */
export function deltaPp(
  likesA: number,
  dislikesA: number,
  likesB: number,
  dislikesB: number,
): number {
  const pctA = likesPct(likesA, dislikesA);
  const pctB = likesPct(likesB, dislikesB);
  return Math.abs(pctA - pctB) * 100;
}

/**
 * Potential points for a round given Δ in percentage points.
 * Harder (smaller) deltas yield higher points, clamped to [100, 800].
 */
export function roundPotentialPoints(deltaPpValue: number): number {
  const multiplier = clamp(
    POINTS_K / Math.max(deltaPpValue, 1),
    POINTS_MIN_MULT,
    POINTS_MAX_MULT,
  );
  return Math.round(POINTS_BASE * multiplier);
}

/** Points earned for a round (0 if incorrect). */
export function roundEarnedPoints(
  deltaPpValue: number,
  isCorrect: boolean,
): number {
  if (!isCorrect) return 0;
  return roundPotentialPoints(deltaPpValue);
}

export type RoundScoreInput = Readonly<{
  deltaPp: number;
  isCorrect: boolean;
}>;

export type DayScore = Readonly<{
  hits: number;
  points: number;
}>;

/** Sum hits and points across a day's rounds. */
export function computeDayScore(rounds: readonly RoundScoreInput[]): DayScore {
  let hits = 0;
  let points = 0;
  for (const round of rounds) {
    if (round.isCorrect) hits += 1;
    points += roundEarnedPoints(round.deltaPp, round.isCorrect);
  }
  return { hits, points };
}

/**
 * Scran id with the higher like percentage.
 * Throws when percentages are equal (generator must forbid ties).
 */
export function correctScranId(
  scranAId: number,
  scranBId: number,
  likesA: number,
  dislikesA: number,
  likesB: number,
  dislikesB: number,
): number {
  const pctA = likesPct(likesA, dislikesA);
  const pctB = likesPct(likesB, dislikesB);
  if (pctA === pctB) {
    throw new Error(
      `correctScranId: equal like percentages for scrans ${scranAId} and ${scranBId}`,
    );
  }
  return pctA > pctB ? scranAId : scranBId;
}
