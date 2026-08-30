import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  dailyScrandles,
  dailyUserResults,
  scrandleVotes,
  scrans,
} from "@/db/schema";
import { getLikesPercentage } from "@/lib/scoring";
import { getCurrentUser } from "@/lib/auth-server";

const TOTAL_ROUNDS = 10;

/** Stable play session: fingerprint if present, else one bucket per IP (no timestamp). */
export function resolvePlaySessionId(
  fingerprint: string | null | undefined,
  clientIp: string,
): string {
  const fp = (fingerprint || "").trim();
  if (fp.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(fp)) {
    return fp.slice(0, 128);
  }
  return `anon-${clientIp || "unknown"}`;
}

function publicScran(s: {
  id: number;
  imageUrl: string;
  name: string;
  description: string | null;
  price: number;
  icon: string | null;
  isSubscriberAtSubmit: boolean | null;
}) {
  return {
    id: s.id,
    imageUrl: s.imageUrl,
    name: s.name,
    description: s.description,
    price: s.price,
    icon: s.icon ?? "Cooked_Cod.png",
    isSubscriberAtSubmit: s.isSubscriberAtSubmit ?? null,
    // likes intentionally omitted from public daily payload
  };
}

export { publicScran };

function correctFromPair(
  scranA: { id: number; numberOfLikes: number; numberOfDislikes: number },
  scranB: { id: number; numberOfLikes: number; numberOfDislikes: number },
  chosenScranId: number,
): { percentageA: number; percentageB: number; correctScranId: number; isCorrect: boolean } {
  const percentageA = Math.floor(
    getLikesPercentage({
      numberOfLikes: scranA.numberOfLikes,
      numberOfDislikes: scranA.numberOfDislikes,
    }),
  );
  const percentageB = Math.floor(
    getLikesPercentage({
      numberOfLikes: scranB.numberOfLikes,
      numberOfDislikes: scranB.numberOfDislikes,
    }),
  );
  let correctScranId =
    percentageA >= percentageB ? scranA.id : scranB.id;
  if (percentageA === percentageB) {
    correctScranId = chosenScranId;
  }
  return {
    percentageA,
    percentageB,
    correctScranId,
    isCorrect: chosenScranId === correctScranId,
  };
}

/**
 * Record a daily round vote. Pair comes only from daily_scrandles (server).
 * Client scran A/B ids are ignored.
 */
export async function recordDailyVote(input: {
  date: string;
  roundNumber: number;
  chosenScranId: number;
  sessionId: string;
  fingerprint: string | null;
}): Promise<
  | {
      success: true;
      roundNumber: number;
      dailyScrandleId: number;
      isCorrect: boolean;
      chosenScranId: number;
      correctScranId: number;
      percentageA: number;
      percentageB: number;
    }
  | { error: string; status: number }
> {
  const { date, roundNumber, chosenScranId, sessionId, fingerprint } = input;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Invalid date", status: 400 };
  }
  if (
    !Number.isInteger(roundNumber) ||
    roundNumber < 1 ||
    roundNumber > TOTAL_ROUNDS
  ) {
    return { error: "Invalid round", status: 400 };
  }
  if (!Number.isInteger(chosenScranId) || chosenScranId <= 0) {
    return { error: "Invalid choice", status: 400 };
  }
  if (!sessionId) {
    return { error: "Missing session", status: 400 };
  }

  const roundRows = await db
    .select()
    .from(dailyScrandles)
    .where(
      and(
        eq(dailyScrandles.date, date),
        eq(dailyScrandles.roundNumber, roundNumber),
      ),
    )
    .limit(1);

  if (roundRows.length === 0) {
    return { error: "Round not found for date", status: 404 };
  }
  const round = roundRows[0];

  if (
    chosenScranId !== round.scranAId &&
    chosenScranId !== round.scranBId
  ) {
    return { error: "Choice not in this round", status: 400 };
  }

  const [scranAData, scranBData] = await Promise.all([
    db.select().from(scrans).where(eq(scrans.id, round.scranAId)).limit(1),
    db.select().from(scrans).where(eq(scrans.id, round.scranBId)).limit(1),
  ]);
  if (scranAData.length === 0 || scranBData.length === 0) {
    return { error: "Scrans not found", status: 404 };
  }

  const scored = correctFromPair(scranAData[0], scranBData[0], chosenScranId);

  // Serialize participation with custom-event cancellation for this date.
  // The round is re-read after taking the lock so cancellation cannot leave an orphan vote.
  const persisted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext(${date}))`);
    const [currentRound] = await tx.select({ id: dailyScrandles.id })
      .from(dailyScrandles)
      .where(and(
        eq(dailyScrandles.id, round.id),
        eq(dailyScrandles.date, date),
        eq(dailyScrandles.roundNumber, roundNumber),
      ))
      .limit(1);
    if (!currentRound) return { kind: "missing" as const };

    const [existing] = await tx
      .select()
      .from(scrandleVotes)
      .where(
        and(
          eq(scrandleVotes.sessionId, sessionId),
          eq(scrandleVotes.dailyScrandleId, round.id),
        ),
      )
      .limit(1);
    if (existing) return { kind: "existing" as const, vote: existing };

    const inserted = await tx.insert(scrandleVotes).values({
      dailyScrandleId: round.id,
      sessionId,
      fingerprintHash: fingerprint,
      chosenScranId,
      createdAt: new Date(),
    }).onConflictDoNothing({
      target: [scrandleVotes.sessionId, scrandleVotes.dailyScrandleId],
    }).returning({ id: scrandleVotes.id });
    if (inserted[0]) return { kind: "inserted" as const };

    // A compatible shared date lock intentionally permits concurrent players,
    // including retries from the same session. Return the winning retry.
    const [racedVote] = await tx
      .select()
      .from(scrandleVotes)
      .where(
        and(
          eq(scrandleVotes.sessionId, sessionId),
          eq(scrandleVotes.dailyScrandleId, round.id),
        ),
      )
      .limit(1);
    if (!racedVote) throw new Error("Conflicting Daily vote could not be reloaded.");
    return { kind: "existing" as const, vote: racedVote };
  });

  if (persisted.kind === "missing") {
    return { error: "Round not found for date", status: 404 };
  }
  if (persisted.kind === "existing") {
    const prev = persisted.vote;
    const prevScored = correctFromPair(
      scranAData[0],
      scranBData[0],
      prev.chosenScranId,
    );
    return {
      success: true,
      roundNumber,
      dailyScrandleId: round.id,
      isCorrect: prevScored.isCorrect,
      chosenScranId: prev.chosenScranId,
      correctScranId: prevScored.correctScranId,
      percentageA: prevScored.percentageA,
      percentageB: prevScored.percentageB,
    };
  }

  return {
    success: true,
    roundNumber,
    dailyScrandleId: round.id,
    isCorrect: scored.isCorrect,
    chosenScranId,
    correctScranId: scored.correctScranId,
    percentageA: scored.percentageA,
    percentageB: scored.percentageB,
  };
}

/**
 * Compute final score from persisted round votes. Never trusts client score.
 */
export async function computeAndStoreDailyResult(input: {
  date: string;
  sessionId: string;
  fingerprint: string | null;
}): Promise<
  | {
      success: true;
      score: number;
      alreadyPlayed?: boolean;
    }
  | { error: string; status: number }
> {
  const { date, sessionId, fingerprint } = input;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Invalid date", status: 400 };
  }
  if (!sessionId) {
    return { error: "Missing session", status: 400 };
  }

  const user = await getCurrentUser();

  const existing = await db
    .select()
    .from(dailyUserResults)
    .where(
      and(
        eq(dailyUserResults.date, date),
        eq(dailyUserResults.sessionId, sessionId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      success: true,
      score: existing[0].score,
      alreadyPlayed: true,
    };
  }

  if (user) {
    const byUser = await db
      .select()
      .from(dailyUserResults)
      .where(
        and(
          eq(dailyUserResults.date, date),
          eq(dailyUserResults.userId, user.id),
        ),
      )
      .limit(1);
    if (byUser.length > 0) {
      return {
        success: true,
        score: byUser[0].score,
        alreadyPlayed: true,
      };
    }
  }

  const rounds = await db
    .select()
    .from(dailyScrandles)
    .where(eq(dailyScrandles.date, date));

  if (rounds.length === 0) {
    return { error: "No daily for this date", status: 404 };
  }
  if (rounds.length < TOTAL_ROUNDS) {
    return { error: "Daily incomplete on server", status: 400 };
  }

  const roundIds = rounds.map((r) => r.id);
  const votes = await db
    .select()
    .from(scrandleVotes)
    .where(
      and(
        eq(scrandleVotes.sessionId, sessionId),
        inArray(scrandleVotes.dailyScrandleId, roundIds),
      ),
    );

  if (votes.length < TOTAL_ROUNDS) {
    return {
      error: `Incomplete game: ${votes.length}/${TOTAL_ROUNDS} rounds recorded`,
      status: 400,
    };
  }

  const voteByRoundId = new Map(
    votes.map((v) => [v.dailyScrandleId, v] as const),
  );

  let score = 0;
  for (const round of rounds) {
    const vote = voteByRoundId.get(round.id);
    if (!vote) {
      return { error: "Missing vote for a round", status: 400 };
    }
    const [aRows, bRows] = await Promise.all([
      db.select().from(scrans).where(eq(scrans.id, round.scranAId)).limit(1),
      db.select().from(scrans).where(eq(scrans.id, round.scranBId)).limit(1),
    ]);
    if (!aRows[0] || !bRows[0]) {
      return { error: "Scran missing for scoring", status: 500 };
    }
    const { isCorrect } = correctFromPair(
      aRows[0],
      bRows[0],
      vote.chosenScranId,
    );
    if (isCorrect) score += 1;
  }

  try {
    const persisted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext(${date}))`);
      const [currentResult] = await tx.select().from(dailyUserResults).where(and(
        eq(dailyUserResults.date, date),
        eq(dailyUserResults.sessionId, sessionId),
      )).limit(1);
      if (currentResult) return { kind: "existing" as const, score: currentResult.score };
      if (user) {
        const [currentUserResult] = await tx.select().from(dailyUserResults).where(and(
          eq(dailyUserResults.date, date),
          eq(dailyUserResults.userId, user.id),
        )).limit(1);
        if (currentUserResult) return { kind: "existing" as const, score: currentUserResult.score };
      }
      const currentRounds = await tx.select({ id: dailyScrandles.id })
        .from(dailyScrandles)
        .where(eq(dailyScrandles.date, date));
      if (currentRounds.length < TOTAL_ROUNDS) return { kind: "missing" as const };
      await tx.insert(dailyUserResults).values({
        date,
        sessionId,
        fingerprintHash: fingerprint,
        score,
        createdAt: new Date(),
        userId: user?.id ?? null,
      });
      return { kind: "inserted" as const };
    });
    if (persisted.kind === "missing") return { error: "No daily for this date", status: 404 };
    if (persisted.kind === "existing") {
      return { success: true, score: persisted.score, alreadyPlayed: true };
    }
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      const again = await db
        .select()
        .from(dailyUserResults)
        .where(
          and(
            eq(dailyUserResults.date, date),
            eq(dailyUserResults.sessionId, sessionId),
          ),
        )
        .limit(1);
      if (again[0]) {
        return { success: true, score: again[0].score, alreadyPlayed: true };
      }
    }
    throw error;
  }

  return { success: true, score };
}
