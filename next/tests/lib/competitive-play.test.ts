import { describe, it, expect } from "vitest";
import {
  evaluateFrozenRound,
  computeDayScoreFromFrozen,
  decideVoteReplay,
  assertPlayDateIsToday,
  PLAY_TODAY_ONLY_ERROR,
  type FrozenRoundInput,
} from "@/lib/competitive/play";
import {
  computeDayScore,
  correctScranId,
  deltaPp,
  roundEarnedPoints,
  roundPotentialPoints,
} from "@/lib/competitive/scoring";
import { COMPETITIVE_ROUNDS } from "@/lib/competitive/constants";

/**
 * Ten frozen rounds with known vote totals (total=100 each side).
 * Δ values span easy → very hard so potential points vary.
 */
function buildFrozenDayFixture(): FrozenRoundInput[] {
  // Each row: [likesA, likesB] with dislikes = 100 - likes → pct = likes%.
  const pairs: Array<[number, number]> = [
    [70, 50], // Δ20 → 100 pts
    [65, 50], // Δ15 → 100 pts
    [58, 50], // Δ8  → 150 pts
    [57, 50], // Δ7  → ~171 pts
    [55, 50], // Δ5  → 240 pts
    [54, 50], // Δ4  → 300 pts
    [53, 50], // Δ3  → 400 pts
    [52, 50], // Δ2  → 600 pts
    [51, 50], // Δ1  → 800 pts
    [72, 50], // Δ22 → 100 pts
  ];

  return pairs.map(([likesA, likesB], i) => ({
    roundNumber: i + 1,
    scranAId: 1000 + i * 2,
    scranBId: 1000 + i * 2 + 1,
    likesA,
    dislikesA: 100 - likesA,
    likesB,
    dislikesB: 100 - likesB,
  }));
}

describe("evaluateFrozenRound", () => {
  const round: FrozenRoundInput = {
    roundNumber: 1,
    scranAId: 10,
    scranBId: 20,
    likesA: 70,
    dislikesA: 30,
    likesB: 50,
    dislikesB: 50,
  };

  it("scores correct choice from frozen likes only", () => {
    const result = evaluateFrozenRound(round, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.isCorrect).toBe(true);
    expect(result.percentageA).toBeCloseTo(70);
    expect(result.percentageB).toBeCloseTo(50);
    expect(result.potentialPoints).toBe(100);
    expect(result.earnedPoints).toBe(100);
    expect(result.deltaPp).toBeCloseTo(20);
  });

  it("wrong choice earns 0 points", () => {
    const result = evaluateFrozenRound(round, 20);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.isCorrect).toBe(false);
    expect(result.earnedPoints).toBe(0);
    expect(result.potentialPoints).toBe(100);
  });

  it("rejects chosenScranId that is neither A nor B", () => {
    const result = evaluateFrozenRound(round, 999);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/A or B/i);
  });

  it("never uses live counts — only frozen fields on the round", () => {
    // Same scran ids, but if someone swapped live totals, frozen still decides.
    const frozen: FrozenRoundInput = {
      roundNumber: 3,
      scranAId: 1,
      scranBId: 2,
      likesA: 90,
      dislikesA: 10, // 90%
      likesB: 40,
      dislikesB: 60, // 40%
    };
    // Correct is A from frozen; "live" would prefer B if it were 95% vs 10% —
    // pure helper has no path to live data.
    const result = evaluateFrozenRound(frozen, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isCorrect).toBe(true);
    expect(result.percentageA).toBeCloseTo(90);
    expect(correctScranId(1, 2, 90, 10, 40, 60)).toBe(1);
  });
});

describe("computeDayScoreFromFrozen (pure finalize math)", () => {
  it("matches computeDayScore for 10 frozen rounds + choices", () => {
    const rounds = buildFrozenDayFixture();
    expect(rounds).toHaveLength(COMPETITIVE_ROUNDS);

    // Mix of correct (A has higher pct in all fixtures) and wrong (pick B).
    const correctPattern = [
      true,
      true,
      false,
      true,
      false,
      true,
      true,
      false,
      true,
      false,
    ];

    const choices = rounds.map((r, i) => ({
      roundNumber: r.roundNumber,
      chosenScranId: correctPattern[i]
        ? correctScranId(
            r.scranAId,
            r.scranBId,
            r.likesA,
            r.dislikesA,
            r.likesB,
            r.dislikesB,
          )
        : r.scranBId ===
            correctScranId(
              r.scranAId,
              r.scranBId,
              r.likesA,
              r.dislikesA,
              r.likesB,
              r.dislikesB,
            )
          ? r.scranAId
          : r.scranBId,
    }));

    const day = computeDayScoreFromFrozen(rounds, choices);
    expect(day.ok).toBe(true);
    if (!day.ok) return;

    const expectedInputs = rounds.map((r, i) => {
      const d = deltaPp(r.likesA, r.dislikesA, r.likesB, r.dislikesB);
      return { deltaPp: d, isCorrect: correctPattern[i]! };
    });
    const expected = computeDayScore(expectedInputs);

    expect(day.hits).toBe(expected.hits);
    expect(day.points).toBe(expected.points);
    expect(day.hits).toBe(correctPattern.filter(Boolean).length);

    // Explicit points sum via roundEarnedPoints (client score ignored concept).
    const manualPoints = expectedInputs.reduce(
      (sum, row) => sum + roundEarnedPoints(row.deltaPp, row.isCorrect),
      0,
    );
    expect(day.points).toBe(manualPoints);
  });

  it("all-correct day sums potential points", () => {
    const rounds = buildFrozenDayFixture();
    const choices = rounds.map((r) => ({
      roundNumber: r.roundNumber,
      chosenScranId: correctScranId(
        r.scranAId,
        r.scranBId,
        r.likesA,
        r.dislikesA,
        r.likesB,
        r.dislikesB,
      ),
    }));

    const day = computeDayScoreFromFrozen(rounds, choices);
    expect(day.ok).toBe(true);
    if (!day.ok) return;

    expect(day.hits).toBe(10);
    const expectedPoints = rounds.reduce((sum, r) => {
      const d = deltaPp(r.likesA, r.dislikesA, r.likesB, r.dislikesB);
      return sum + roundPotentialPoints(d);
    }, 0);
    expect(day.points).toBe(expectedPoints);
  });

  it("all-wrong day is 0 points and 0 hits", () => {
    const rounds = buildFrozenDayFixture();
    const choices = rounds.map((r) => {
      const correct = correctScranId(
        r.scranAId,
        r.scranBId,
        r.likesA,
        r.dislikesA,
        r.likesB,
        r.dislikesB,
      );
      return {
        roundNumber: r.roundNumber,
        chosenScranId: correct === r.scranAId ? r.scranBId : r.scranAId,
      };
    });

    const day = computeDayScoreFromFrozen(rounds, choices);
    expect(day.ok).toBe(true);
    if (!day.ok) return;
    expect(day.hits).toBe(0);
    expect(day.points).toBe(0);
  });

  it("fails when a round choice is missing", () => {
    const rounds = buildFrozenDayFixture();
    const choices = rounds.slice(0, 9).map((r) => ({
      roundNumber: r.roundNumber,
      chosenScranId: r.scranAId,
    }));

    const day = computeDayScoreFromFrozen(rounds, choices);
    expect(day.ok).toBe(false);
    if (day.ok) return;
    expect(day.error).toMatch(/missing|incomplete|vote/i);
  });

  it("fails when choice is not A or B", () => {
    const rounds = buildFrozenDayFixture();
    const choices = rounds.map((r, i) => ({
      roundNumber: r.roundNumber,
      chosenScranId: i === 0 ? 99999 : r.scranAId,
    }));

    const day = computeDayScoreFromFrozen(rounds, choices);
    expect(day.ok).toBe(false);
  });

  it("does not accept a client-provided score — only frozen math", () => {
    // Documented contract: finalize ignores any client score field.
    // Pure path has no clientScore parameter at all.
    const rounds = buildFrozenDayFixture().slice(0, 1);
    const choices = [
      {
        roundNumber: 1,
        chosenScranId: correctScranId(
          rounds[0]!.scranAId,
          rounds[0]!.scranBId,
          rounds[0]!.likesA,
          rounds[0]!.dislikesA,
          rounds[0]!.likesB,
          rounds[0]!.dislikesB,
        ),
      },
    ];
    const day = computeDayScoreFromFrozen(rounds, choices);
    expect(day.ok).toBe(true);
    if (!day.ok) return;
    // Client claiming 9999 would be ignored; server math wins.
    expect(day.points).toBe(
      roundPotentialPoints(
        deltaPp(
          rounds[0]!.likesA,
          rounds[0]!.dislikesA,
          rounds[0]!.likesB,
          rounds[0]!.dislikesB,
        ),
      ),
    );
    expect(day.points).not.toBe(9999);
  });
});

describe("decideVoteReplay (immutable first choice)", () => {
  it("is idempotent when chosenScranId matches existing vote", () => {
    const decision = decideVoteReplay(10, 10);
    expect(decision.kind).toBe("idempotent");
  });

  it("conflicts with 409 when chosenScranId differs", () => {
    const decision = decideVoteReplay(10, 20);
    expect(decision.kind).toBe("conflict");
    if (decision.kind !== "conflict") return;
    expect(decision.status).toBe(409);
    expect(decision.error).toBe("Ответ уже записан");
  });

  it("does not allow flipping after percentages would be revealed", () => {
    // Integrity: once A was chosen, replaying B is never OK (pure rule used by recordCompetitiveVote).
    const first = 100;
    const flipped = 200;
    expect(decideVoteReplay(first, flipped).kind).toBe("conflict");
    expect(decideVoteReplay(first, first).kind).toBe("idempotent");
  });
});

describe("assertPlayDateIsToday (today-only play)", () => {
  it("accepts the current MSK date", () => {
    const result = assertPlayDateIsToday("2024-07-15", "2024-07-15");
    expect(result.ok).toBe(true);
  });

  it("rejects past MSK dates with 400 and Russian message", () => {
    const result = assertPlayDateIsToday("2024-07-14", "2024-07-15");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.error).toBe(PLAY_TODAY_ONLY_ERROR);
    expect(result.error).toBe("Можно играть только сегодняшний дейлик");
  });

  it("rejects future MSK dates", () => {
    const result = assertPlayDateIsToday("2024-07-16", "2024-07-15");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.error).toBe(PLAY_TODAY_ONLY_ERROR);
  });
});
