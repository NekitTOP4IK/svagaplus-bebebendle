/**
 * Competitive play integrity: vote, finalize, standings upsert.
 *
 * Correctness and points always come from frozen competitive_rounds
 * likes/dislikes — never live scrans counts. Client-sent scores are ignored.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  competitiveDailies,
  competitiveRounds,
  competitiveVotes,
  competitiveResults,
  competitiveStandings,
  type CompetitiveResult,
} from "@/db/schema";
import { todayMskDate } from "@/lib/daily-timezone";
import { COMPETITIVE_ROUNDS } from "./constants";
import { isCompetitiveEnabled } from "./feature";
import {
  computeDayScore,
  correctScranId,
  deltaPp,
  likesPct,
  roundEarnedPoints,
  roundPotentialPoints,
  type DayScore,
} from "./scoring";
import { getPlayableSeason } from "./seasons";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; used by DB paths)
// ---------------------------------------------------------------------------

export const PLAY_TODAY_ONLY_ERROR = "Можно играть только сегодняшний дейлик";
export const DAILY_SEASON_MISMATCH_ERROR =
  "Дейлик не относится к текущему сезону";

/**
 * Pure guard: competitive play is allowed only for the current MSK calendar day.
 */
export function assertPlayDateIsToday(
  date: string,
  today: string = todayMskDate(),
): { ok: true } | { ok: false; error: string; status: 400 } {
  if (date !== today) {
    return {
      ok: false,
      error: PLAY_TODAY_ONLY_ERROR,
      status: 400,
    };
  }
  return { ok: true };
}

export type FrozenRoundInput = Readonly<{
  roundNumber: number;
  scranAId: number;
  scranBId: number;
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
}>;

export type RoundChoice = Readonly<{
  roundNumber: number;
  chosenScranId: number;
}>;

export type EvaluateFrozenRoundResult =
  | {
      ok: true;
      isCorrect: boolean;
      percentageA: number;
      percentageB: number;
      potentialPoints: number;
      earnedPoints: number;
      deltaPp: number;
    }
  | { ok: false; error: string };

export type ComputeDayFromFrozenResult =
  | ({ ok: true } & DayScore)
  | { ok: false; error: string };

/** Like rate as a 0–100 percentage for API/UI. */
function percentageDisplay(likes: number, dislikes: number): number {
  return likesPct(likes, dislikes) * 100;
}

/**
 * Score a single round from frozen likes/dislikes only.
 * chosenScranId must be A or B.
 */
export function evaluateFrozenRound(
  round: FrozenRoundInput,
  chosenScranId: number,
): EvaluateFrozenRoundResult {
  if (
    chosenScranId !== round.scranAId &&
    chosenScranId !== round.scranBId
  ) {
    return {
      ok: false,
      error: "chosenScranId must be scran A or B for this round",
    };
  }

  const delta = deltaPp(
    round.likesA,
    round.dislikesA,
    round.likesB,
    round.dislikesB,
  );

  let correctId: number;
  try {
    correctId = correctScranId(
      round.scranAId,
      round.scranBId,
      round.likesA,
      round.dislikesA,
      round.likesB,
      round.dislikesB,
    );
  } catch {
    return {
      ok: false,
      error: "Round has equal like percentages (invalid frozen pair)",
    };
  }

  const isCorrect = chosenScranId === correctId;
  const potentialPoints = roundPotentialPoints(delta);
  const earnedPoints = roundEarnedPoints(delta, isCorrect);

  return {
    ok: true,
    isCorrect,
    percentageA: percentageDisplay(round.likesA, round.dislikesA),
    percentageB: percentageDisplay(round.likesB, round.dislikesB),
    potentialPoints,
    earnedPoints,
    deltaPp: delta,
  };
}

/**
 * Pure finalize math: given frozen rounds + choices, compute day hits/points.
 * Matches `computeDayScore` on the derived round score inputs.
 * Does not accept a client score.
 */
export function computeDayScoreFromFrozen(
  rounds: readonly FrozenRoundInput[],
  choices: readonly RoundChoice[],
): ComputeDayFromFrozenResult {
  if (rounds.length === 0) {
    return { ok: false, error: "No rounds to score" };
  }

  const choiceByRound = new Map(
    choices.map((c) => [c.roundNumber, c.chosenScranId]),
  );

  const scoreInputs: Array<{ deltaPp: number; isCorrect: boolean }> = [];

  for (const round of rounds) {
    const chosen = choiceByRound.get(round.roundNumber);
    if (chosen === undefined) {
      return {
        ok: false,
        error: `Missing vote for round ${round.roundNumber}`,
      };
    }

    const evaluated = evaluateFrozenRound(round, chosen);
    if (!evaluated.ok) {
      return { ok: false, error: evaluated.error };
    }

    scoreInputs.push({
      deltaPp: evaluated.deltaPp,
      isCorrect: evaluated.isCorrect,
    });
  }

  const day = computeDayScore(scoreInputs);
  return { ok: true, hits: day.hits, points: day.points };
}

/**
 * Pure vote-immutability decision for (userId, roundId).
 * First choice is final: same id is idempotent; different choice is conflict.
 */
export type VoteReplayDecision =
  | { kind: "idempotent" }
  | { kind: "conflict"; error: string; status: 409 };

export function decideVoteReplay(
  existingChosenScranId: number,
  requestedChosenScranId: number,
): VoteReplayDecision {
  if (existingChosenScranId === requestedChosenScranId) {
    return { kind: "idempotent" };
  }
  return {
    kind: "conflict",
    error: "Ответ уже записан",
    status: 409,
  };
}

// ---------------------------------------------------------------------------
// DB-backed play API
// ---------------------------------------------------------------------------

export type RecordCompetitiveVoteResult =
  | {
      ok: true;
      isCorrect: boolean;
      percentageA: number;
      percentageB: number;
      potentialPoints: number;
      earnedPoints: number;
    }
  | { ok: false; error: string; status: number };

export type FinalizeCompetitiveResult =
  | { ok: true; hits: number; points: number }
  | { ok: false; error: string; status: number };

async function getDailyByDate(date: string): Promise<{
  id: number;
  date: string;
  seasonId: number;
} | null> {
  const [row] = await db
    .select({
      id: competitiveDailies.id,
      date: competitiveDailies.date,
      seasonId: competitiveDailies.seasonId,
    })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.date, date))
    .limit(1);
  return row ?? null;
}

/**
 * Record a competitive vote for one round.
 * Correctness uses frozen round likes only.
 * Votes are insert-only: first (userId, roundId) choice is immutable.
 * Same chosenScranId is idempotent; a different choice returns 409.
 */
export async function recordCompetitiveVote(input: {
  userId: number;
  date: string;
  roundNumber: number;
  chosenScranId: number;
}): Promise<RecordCompetitiveVoteResult> {
  const { userId, date, roundNumber, chosenScranId } = input;

  if (!(await isCompetitiveEnabled())) {
    return {
      ok: false,
      error: "Competitive mode is disabled",
      status: 403,
    };
  }

  const todayGuard = assertPlayDateIsToday(date);
  if (!todayGuard.ok) {
    return todayGuard;
  }

  const season = await getPlayableSeason();
  if (!season) {
    return {
      ok: false,
      error: "No playable competitive season",
      status: 400,
    };
  }

  if (
    !Number.isInteger(roundNumber) ||
    roundNumber < 1 ||
    roundNumber > COMPETITIVE_ROUNDS
  ) {
    return {
      ok: false,
      error: `roundNumber must be 1..${COMPETITIVE_ROUNDS}`,
      status: 400,
    };
  }

  const daily = await getDailyByDate(date);
  if (!daily) {
    return {
      ok: false,
      error: "No competitive daily for this date",
      status: 404,
    };
  }

  if (daily.seasonId !== season.id) {
    return {
      ok: false,
      error: DAILY_SEASON_MISMATCH_ERROR,
      status: 400,
    };
  }

  if (await hasPlayed(userId, date)) {
    return {
      ok: false,
      error: "Already finalized result for this date",
      status: 409,
    };
  }

  const [round] = await db
    .select()
    .from(competitiveRounds)
    .where(
      and(
        eq(competitiveRounds.dailyId, daily.id),
        eq(competitiveRounds.roundNumber, roundNumber),
      ),
    )
    .limit(1);

  if (!round) {
    return {
      ok: false,
      error: "Round not found",
      status: 404,
    };
  }

  const frozen: FrozenRoundInput = {
    roundNumber: round.roundNumber,
    scranAId: round.scranAId,
    scranBId: round.scranBId,
    likesA: round.likesA,
    dislikesA: round.dislikesA,
    likesB: round.likesB,
    dislikesB: round.dislikesB,
  };

  // Existing vote: immutable — idempotent if same choice, 409 if different.
  const [existing] = await db
    .select({ chosenScranId: competitiveVotes.chosenScranId })
    .from(competitiveVotes)
    .where(
      and(
        eq(competitiveVotes.userId, userId),
        eq(competitiveVotes.roundId, round.id),
      ),
    )
    .limit(1);

  if (existing) {
    const decision = decideVoteReplay(existing.chosenScranId, chosenScranId);
    if (decision.kind === "conflict") {
      return {
        ok: false,
        error: decision.error,
        status: decision.status,
      };
    }
    // Return evaluation for the stored (immutable) choice.
    const prevEval = evaluateFrozenRound(frozen, existing.chosenScranId);
    if (!prevEval.ok) {
      return { ok: false, error: prevEval.error, status: 500 };
    }
    return {
      ok: true,
      isCorrect: prevEval.isCorrect,
      percentageA: prevEval.percentageA,
      percentageB: prevEval.percentageB,
      potentialPoints: prevEval.potentialPoints,
      earnedPoints: prevEval.earnedPoints,
    };
  }

  const evaluated = evaluateFrozenRound(frozen, chosenScranId);
  if (!evaluated.ok) {
    return { ok: false, error: evaluated.error, status: 400 };
  }

  try {
    // Insert-only: never update chosenScranId after first write.
    await db.insert(competitiveVotes).values({
      roundId: round.id,
      userId,
      chosenScranId,
    });
  } catch (error) {
    // Race on unique (userId, roundId): re-read and apply immutability rules.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "23505" || message.includes("unique") || message.includes("duplicate")) {
      const [again] = await db
        .select({ chosenScranId: competitiveVotes.chosenScranId })
        .from(competitiveVotes)
        .where(
          and(
            eq(competitiveVotes.userId, userId),
            eq(competitiveVotes.roundId, round.id),
          ),
        )
        .limit(1);

      if (again) {
        const decision = decideVoteReplay(again.chosenScranId, chosenScranId);
        if (decision.kind === "conflict") {
          return {
            ok: false,
            error: decision.error,
            status: decision.status,
          };
        }
        const prevEval = evaluateFrozenRound(frozen, again.chosenScranId);
        if (!prevEval.ok) {
          return { ok: false, error: prevEval.error, status: 500 };
        }
        return {
          ok: true,
          isCorrect: prevEval.isCorrect,
          percentageA: prevEval.percentageA,
          percentageB: prevEval.percentageB,
          potentialPoints: prevEval.potentialPoints,
          earnedPoints: prevEval.earnedPoints,
        };
      }
    }

    console.error(
      "[competitive-play] vote insert failed",
      { userId, date, roundNumber },
      error,
    );
    return {
      ok: false,
      error: "Failed to record vote",
      status: 500,
    };
  }

  console.log(
    `[competitive-play] vote user=${userId} date=${date} round=${roundNumber} correct=${evaluated.isCorrect} earned=${evaluated.earnedPoints}`,
  );

  return {
    ok: true,
    isCorrect: evaluated.isCorrect,
    percentageA: evaluated.percentageA,
    percentageB: evaluated.percentageB,
    potentialPoints: evaluated.potentialPoints,
    earnedPoints: evaluated.earnedPoints,
  };
}

/**
 * Finalize a competitive day from stored votes + frozen rounds.
 * Inserts unique result and upserts season standings.
 * Any client-provided score is intentionally not a parameter.
 */
export async function finalizeCompetitive(input: {
  userId: number;
  date: string;
}): Promise<FinalizeCompetitiveResult> {
  const { userId, date } = input;

  if (!(await isCompetitiveEnabled())) {
    return {
      ok: false,
      error: "Competitive mode is disabled",
      status: 403,
    };
  }

  const todayGuard = assertPlayDateIsToday(date);
  if (!todayGuard.ok) {
    return todayGuard;
  }

  const season = await getPlayableSeason();
  if (!season) {
    return {
      ok: false,
      error: "No playable competitive season",
      status: 400,
    };
  }

  const daily = await getDailyByDate(date);
  if (!daily) {
    return {
      ok: false,
      error: "No competitive daily for this date",
      status: 404,
    };
  }

  if (daily.seasonId !== season.id) {
    return {
      ok: false,
      error: DAILY_SEASON_MISMATCH_ERROR,
      status: 400,
    };
  }

  if (await hasPlayed(userId, date)) {
    return {
      ok: false,
      error: "Already finalized result for this date",
      status: 409,
    };
  }

  const rounds = await db
    .select()
    .from(competitiveRounds)
    .where(eq(competitiveRounds.dailyId, daily.id));

  if (rounds.length !== COMPETITIVE_ROUNDS) {
    return {
      ok: false,
      error: `Daily has ${rounds.length} rounds, expected ${COMPETITIVE_ROUNDS}`,
      status: 500,
    };
  }

  const roundIds = rounds.map((r) => r.id);
  const votes = await db
    .select({
      roundId: competitiveVotes.roundId,
      chosenScranId: competitiveVotes.chosenScranId,
    })
    .from(competitiveVotes)
    .where(
      and(
        eq(competitiveVotes.userId, userId),
        inArray(competitiveVotes.roundId, roundIds),
      ),
    );

  if (votes.length !== COMPETITIVE_ROUNDS) {
    return {
      ok: false,
      error: `Need ${COMPETITIVE_ROUNDS} votes to finalize, have ${votes.length}`,
      status: 400,
    };
  }

  const voteByRoundId = new Map(
    votes.map((v) => [v.roundId, v.chosenScranId]),
  );

  const frozen: FrozenRoundInput[] = [];
  const choices: RoundChoice[] = [];

  for (const round of rounds) {
    const chosen = voteByRoundId.get(round.id);
    if (chosen === undefined) {
      return {
        ok: false,
        error: `Missing vote for round ${round.roundNumber}`,
        status: 400,
      };
    }
    frozen.push({
      roundNumber: round.roundNumber,
      scranAId: round.scranAId,
      scranBId: round.scranBId,
      likesA: round.likesA,
      dislikesA: round.dislikesA,
      likesB: round.likesB,
      dislikesB: round.dislikesB,
    });
    choices.push({
      roundNumber: round.roundNumber,
      chosenScranId: chosen,
    });
  }

  const scored = computeDayScoreFromFrozen(frozen, choices);
  if (!scored.ok) {
    return { ok: false, error: scored.error, status: 400 };
  }

  const { hits, points } = scored;
  // Standings attach to the daily's season (source of truth for that date).
  const seasonId = daily.seasonId;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(competitiveResults).values({
        userId,
        date,
        seasonId,
        hits,
        points,
      });

      await tx
        .insert(competitiveStandings)
        .values({
          seasonId,
          userId,
          points,
          daysPlayed: 1,
          hits,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            competitiveStandings.seasonId,
            competitiveStandings.userId,
          ],
          set: {
            points: sql`${competitiveStandings.points} + ${points}`,
            daysPlayed: sql`${competitiveStandings.daysPlayed} + 1`,
            hits: sql`${competitiveStandings.hits} + ${hits}`,
            updatedAt: new Date(),
          },
        });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unique") || message.includes("duplicate")) {
      return {
        ok: false,
        error: "Already finalized result for this date",
        status: 409,
      };
    }
    console.error(
      "[competitive-play] finalize failed",
      { userId, date },
      error,
    );
    return {
      ok: false,
      error: "Failed to finalize competitive day",
      status: 500,
    };
  }

  console.log(
    `[competitive-play] finalize user=${userId} date=${date} hits=${hits} points=${points} season=${seasonId}`,
  );

  return { ok: true, hits, points };
}

export async function getUserResult(
  userId: number,
  date: string,
): Promise<CompetitiveResult | null> {
  const [row] = await db
    .select()
    .from(competitiveResults)
    .where(
      and(
        eq(competitiveResults.userId, userId),
        eq(competitiveResults.date, date),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function hasPlayed(
  userId: number,
  date: string,
): Promise<boolean> {
  const result = await getUserResult(userId, date);
  return result !== null;
}
