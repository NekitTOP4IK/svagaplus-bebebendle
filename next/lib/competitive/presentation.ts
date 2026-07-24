/**
 * Per-user competitive daily presentation: seeded round shuffle + A/B flip.
 *
 * Generation stores rounds in DB with fixed order/sides. Delivery permutes
 * order and left/right so shared spoilers (e.g. "round 3 left") fail across users.
 * Vote identity remains competitive_rounds.id (roundId); scoring uses frozen likes.
 */

import { createHmac } from "node:crypto";

export type CanonicalRound = Readonly<{
  id: number;
  roundNumber: number;
  scranAId: number;
  scranBId: number;
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
}>;

export type PresentedRound = Readonly<{
  /** 1..N for UI only */
  displayRoundNumber: number;
  roundId: number;
  /** Canonical DB round number */
  roundNumber: number;
  scranAId: number;
  scranBId: number;
  /** Likes for presented A/B (swapped when flipped) — server-side only */
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
  flipped: boolean;
}>;

let loggedInsecurePepper = false;

/**
 * Pepper for presentation HMAC. Prefer dedicated secret; fall back to session secret
 * then a dev-only default.
 */
export function getPresentationPepper(): string {
  const dedicated = process.env.COMPETITIVE_PRESENTATION_SECRET?.trim();
  if (dedicated) return dedicated;

  const session = process.env.SESSION_SECRET?.trim();
  if (session) return session;

  if (
    !loggedInsecurePepper &&
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_ENV !== "test"
  ) {
    loggedInsecurePepper = true;
    console.warn(
      "[competitive-presentation] COMPETITIVE_PRESENTATION_SECRET and SESSION_SECRET unset; using insecure dev pepper",
    );
  }
  return "dev-insecure-presentation-pepper";
}

/**
 * Deterministic seed: HMAC-SHA256(pepper, `${userId}:${date}:${dailyId}`).
 */
export function presentationSeed(
  pepper: string,
  userId: number,
  date: string,
  dailyId: number,
): Buffer {
  return createHmac("sha256", pepper)
    .update(`${userId}:${date}:${dailyId}`)
    .digest();
}

/**
 * mulberry32 PRNG from first 4 bytes of seed (unsigned 32-bit).
 * Returns floats in [0, 1).
 */
function mulberry32(seed: Buffer): () => number {
  let a = seed.readUInt32BE(0);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded Fisher–Yates shuffle + independent A/B flip per presented slot.
 * Same seed → same order and flips; different users → different seeds → different presentation.
 */
export function presentRounds(
  rounds: readonly CanonicalRound[],
  seed: Buffer,
): PresentedRound[] {
  const rng = mulberry32(seed);
  const shuffled = rounds.slice();

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  return shuffled.map((round, index) => {
    const flipped = rng() < 0.5;
    if (flipped) {
      return {
        displayRoundNumber: index + 1,
        roundId: round.id,
        roundNumber: round.roundNumber,
        scranAId: round.scranBId,
        scranBId: round.scranAId,
        likesA: round.likesB,
        dislikesA: round.dislikesB,
        likesB: round.likesA,
        dislikesB: round.dislikesA,
        flipped: true,
      };
    }
    return {
      displayRoundNumber: index + 1,
      roundId: round.id,
      roundNumber: round.roundNumber,
      scranAId: round.scranAId,
      scranBId: round.scranBId,
      likesA: round.likesA,
      dislikesA: round.dislikesA,
      likesB: round.likesB,
      dislikesB: round.dislikesB,
      flipped: false,
    };
  });
}
