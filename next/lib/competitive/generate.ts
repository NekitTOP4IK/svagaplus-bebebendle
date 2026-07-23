/**
 * Competitive daily generator: pure close-pair selection + MSK day persistence.
 */

import { eq, inArray } from "drizzle-orm";
import {
  db,
  scrans,
  competitivePoolEntries,
  competitiveDailies,
  competitiveRounds,
} from "@/db/schema";
import {
  COMPETITIVE_ROUNDS,
  MIN_COMPETITIVE_VOTES,
} from "./constants";
import { isCompetitiveEnabled } from "./feature";
import { pairKey, bandForRound, isDeltaInBand, canPair } from "./pairs";
import { syncCooldownSnapshots } from "./pool";
import { deltaPp } from "./scoring";
import { getPlayableSeason } from "./seasons";

/** Cap for maxDelta when a band is starved (widen upward / easier). */
const MAX_WIDEN_DELTA = 40;
const WIDEN_STEP = 2;

export type CompetitivePairCandidate = Readonly<{
  scranId: number;
  likes: number;
  dislikes: number;
}>;

export type SelectedCompetitivePair = Readonly<{
  roundNumber: number;
  scranAId: number;
  scranBId: number;
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
  pairKey: string;
  deltaPp: number;
}>;

export type SelectCompetitivePairsResult =
  | { ok: true; pairs: SelectedCompetitivePair[] }
  | { ok: false; error: string };

export type GenerateCompetitiveDailyResult =
  | { ok: true; dailyId: number }
  | { ok: false; error: string; status: number };

type MutableCandidate = {
  scranId: number;
  likes: number;
  dislikes: number;
};

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * Collect all unordered pairs among free candidates that sit in [minDelta, maxDelta],
 * with unequal like %, free pair_key, and delta > 0.
 */
function collectValidPairs(
  free: readonly MutableCandidate[],
  usedPairKeys: ReadonlySet<string>,
  minDelta: number,
  maxDelta: number,
): SelectedCompetitivePair[] {
  const out: SelectedCompetitivePair[] = [];

  for (let i = 0; i < free.length; i++) {
    const a = free[i]!;
    for (let j = i + 1; j < free.length; j++) {
      const b = free[j]!;
      if (a.scranId === b.scranId) continue;

      if (!canPair(a.likes, a.dislikes, b.likes, b.dislikes)) continue;

      const delta = deltaPp(a.likes, a.dislikes, b.likes, b.dislikes);
      // Generator must never emit ties (delta === 0) or out-of-band pairs.
      if (!(delta > 0)) continue;
      if (!isDeltaInBand(delta, minDelta, maxDelta)) continue;

      const key = pairKey(a.scranId, b.scranId);
      if (usedPairKeys.has(key)) continue;

      // Canonical A/B order by scran id (pair_key is unordered).
      const [left, right] =
        a.scranId < b.scranId ? [a, b] : [b, a];

      out.push({
        roundNumber: 0, // filled by caller
        scranAId: left.scranId,
        scranBId: right.scranId,
        likesA: left.likes,
        dislikesA: left.dislikes,
        likesB: right.likes,
        dislikesB: right.dislikes,
        pairKey: key,
        deltaPp: delta,
      });
    }
  }

  return out;
}

/**
 * Pure pair selection for a competitive daily.
 *
 * For each round 1..N: prefer a random pair inside the round's difficulty band.
 * If the band is empty, widen maxDelta by +2 repeatedly up to 40 (easier pairs).
 * Never allows delta === 0. Same scran at most once per day; pair_key never reused.
 */
export function selectCompetitivePairs(input: {
  candidates: Array<{ scranId: number; likes: number; dislikes: number }>;
  usedPairKeys: Set<string>;
  rounds?: number;
}): SelectCompetitivePairsResult {
  const rounds = input.rounds ?? COMPETITIVE_ROUNDS;
  if (rounds < 1) {
    return { ok: false, error: "rounds must be >= 1" };
  }

  const eligible: MutableCandidate[] = input.candidates
    .filter((c) => c.likes + c.dislikes >= MIN_COMPETITIVE_VOTES)
    .map((c) => ({
      scranId: c.scranId,
      likes: c.likes,
      dislikes: c.dislikes,
    }));

  if (eligible.length < rounds * 2) {
    return {
      ok: false,
      error: `Not enough eligible candidates (need ${rounds * 2}, have ${eligible.length} with ≥${MIN_COMPETITIVE_VOTES} votes)`,
    };
  }

  const usedScranIds = new Set<number>();
  const usedPairKeys = new Set(input.usedPairKeys);
  const pairs: SelectedCompetitivePair[] = [];

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber++) {
    const band = bandForRound(roundNumber);
    const free = eligible.filter((c) => !usedScranIds.has(c.scranId));

    let maxDelta = band.maxDelta;
    let chosen: SelectedCompetitivePair | null = null;
    let chosenMaxDelta = band.maxDelta;

    while (true) {
      const valid = collectValidPairs(
        free,
        usedPairKeys,
        band.minDelta,
        maxDelta,
      );
      if (valid.length > 0) {
        shuffleInPlace(valid);
        chosen = valid[0]!;
        chosenMaxDelta = maxDelta;
        break;
      }
      if (maxDelta >= MAX_WIDEN_DELTA) break;
      maxDelta = Math.min(MAX_WIDEN_DELTA, maxDelta + WIDEN_STEP);
    }

    if (!chosen) {
      return {
        ok: false,
        error: `Could not select a pair for round ${roundNumber} (band ${band.minDelta}–${band.maxDelta}, widened maxΔ up to ${MAX_WIDEN_DELTA})`,
      };
    }

    if (chosenMaxDelta > band.maxDelta) {
      console.log(
        `[competitive-generate] round ${roundNumber}: band starved; widened maxDelta ${band.maxDelta} → ${chosenMaxDelta}`,
      );
    }

    const pair: SelectedCompetitivePair = {
      ...chosen,
      roundNumber,
    };
    pairs.push(pair);
    usedScranIds.add(pair.scranAId);
    usedScranIds.add(pair.scranBId);
    usedPairKeys.add(pair.pairKey);
  }

  return { ok: true, pairs };
}

/**
 * Generate a competitive daily for an MSK calendar date.
 *
 * Steps: feature flag → playable season → uniqueness → sync cooldown snapshots →
 * load enabled pool (original votes ≥ 15) → select pairs → insert daily+rounds
 * with frozen snapshot likes/dislikes → update last_used_date.
 */
export async function generateCompetitiveDaily(
  dateMsk: string,
): Promise<GenerateCompetitiveDailyResult> {
  if (!(await isCompetitiveEnabled())) {
    return {
      ok: false,
      error: "Competitive mode is disabled",
      status: 403,
    };
  }

  const season = await getPlayableSeason();
  if (!season) {
    return {
      ok: false,
      error: "No playable competitive season",
      status: 400,
    };
  }

  const [existing] = await db
    .select({ id: competitiveDailies.id })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.date, dateMsk))
    .limit(1);

  if (existing) {
    return {
      ok: false,
      error: "Competitive daily already exists for this date",
      status: 409,
    };
  }

  await syncCooldownSnapshots(dateMsk);

  const poolRows = await db
    .select({
      scranId: competitivePoolEntries.scranId,
      likesSnapshot: competitivePoolEntries.likesSnapshot,
      dislikesSnapshot: competitivePoolEntries.dislikesSnapshot,
      numberOfLikes: scrans.numberOfLikes,
      numberOfDislikes: scrans.numberOfDislikes,
    })
    .from(competitivePoolEntries)
    .innerJoin(scrans, eq(competitivePoolEntries.scranId, scrans.id))
    .where(eq(competitivePoolEntries.enabled, true));

  // Eligibility: original votes ≥ 15. Pair math + freeze: pool snapshots.
  const candidates: CompetitivePairCandidate[] = poolRows
    .filter(
      (row) =>
        row.numberOfLikes + row.numberOfDislikes >= MIN_COMPETITIVE_VOTES,
    )
    .map((row) => ({
      scranId: row.scranId,
      likes: row.likesSnapshot,
      dislikes: row.dislikesSnapshot,
    }));

  const pairKeyRows = await db
    .select({ pairKey: competitiveRounds.pairKey })
    .from(competitiveRounds);
  const usedPairKeys = new Set(pairKeyRows.map((r) => r.pairKey));

  const selected = selectCompetitivePairs({ candidates, usedPairKeys });
  if (!selected.ok) {
    console.error(
      `[competitive-generate] pair selection failed date=${dateMsk}: ${selected.error}`,
    );
    return { ok: false, error: selected.error, status: 400 };
  }

  try {
    const dailyId = await db.transaction(async (tx) => {
      const [daily] = await tx
        .insert(competitiveDailies)
        .values({
          date: dateMsk,
          seasonId: season.id,
        })
        .returning({ id: competitiveDailies.id });

      if (!daily) {
        throw new Error("insert competitive_dailies returned no row");
      }

      await tx.insert(competitiveRounds).values(
        selected.pairs.map((p) => ({
          dailyId: daily.id,
          roundNumber: p.roundNumber,
          scranAId: p.scranAId,
          scranBId: p.scranBId,
          likesA: p.likesA,
          dislikesA: p.dislikesA,
          likesB: p.likesB,
          dislikesB: p.dislikesB,
          pairKey: p.pairKey,
        })),
      );

      const usedScranIds = [
        ...new Set(
          selected.pairs.flatMap((p) => [p.scranAId, p.scranBId]),
        ),
      ];

      await tx
        .update(competitivePoolEntries)
        .set({ lastUsedDate: dateMsk, updatedAt: new Date() })
        .where(inArray(competitivePoolEntries.scranId, usedScranIds));

      return daily.id;
    });

    console.log(
      `[competitive-generate] created daily id=${dailyId} date=${dateMsk} season=${season.id} rounds=${selected.pairs.length}`,
    );
    return { ok: true, dailyId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unique") || message.includes("duplicate")) {
      return {
        ok: false,
        error: "Competitive daily already exists for this date",
        status: 409,
      };
    }
    console.error("[competitive-generate] insert failed", dateMsk, error);
    return {
      ok: false,
      error: "Failed to persist competitive daily",
      status: 500,
    };
  }
}
