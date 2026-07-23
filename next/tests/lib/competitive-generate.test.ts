import { describe, it, expect } from "vitest";
import {
  selectCompetitivePairs,
  isMskDateInSeasonWindow,
} from "@/lib/competitive/generate";
import { pairKey, bandForRound } from "@/lib/competitive/pairs";
import { COMPETITIVE_ROUNDS, MIN_COMPETITIVE_VOTES } from "@/lib/competitive/constants";
import { mskDateStartUtc } from "@/lib/daily-timezone";

/**
 * Build N candidates with fixed total votes and staggered like-rates so every
 * difficulty band has many valid pairs.
 *
 * likes / 100 ≈ 0.20, 0.22, … covering easy (12–25pp) through very hard (1–3pp).
 */
function buildFixtureCandidates(count: number = 30): Array<{
  scranId: number;
  likes: number;
  dislikes: number;
}> {
  const total = 100;
  const candidates: Array<{ scranId: number; likes: number; dislikes: number }> =
    [];

  for (let i = 0; i < count; i++) {
    // Spread like rates from 20% to ~78% in 2pp steps (then wrap).
    const likes = 20 + (i % 30) * 2;
    candidates.push({
      scranId: i + 1,
      likes,
      dislikes: total - likes,
    });
  }

  return candidates;
}

describe("selectCompetitivePairs", () => {
  it("selects 10 pairs from a 30-candidate fixture", () => {
    const candidates = buildFixtureCandidates(30);
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pairs).toHaveLength(COMPETITIVE_ROUNDS);
    expect(result.pairs.map((p) => p.roundNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("never reuses a scran within the day", () => {
    const candidates = buildFixtureCandidates(30);
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.pairs.flatMap((p) => [p.scranAId, p.scranBId]);
    expect(ids).toHaveLength(COMPETITIVE_ROUNDS * 2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never emits zero delta or equal-pct pairs", () => {
    const candidates = buildFixtureCandidates(30);
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const p of result.pairs) {
      expect(p.deltaPp).toBeGreaterThan(0);
      const pctA = p.likesA / (p.likesA + p.dislikesA);
      const pctB = p.likesB / (p.likesB + p.dislikesB);
      expect(pctA).not.toBe(pctB);
    }
  });

  it("emits unique pair keys matching pairKey(a,b)", () => {
    const candidates = buildFixtureCandidates(30);
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const keys = result.pairs.map((p) => p.pairKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of result.pairs) {
      expect(p.pairKey).toBe(pairKey(p.scranAId, p.scranBId));
      expect(p.scranAId).toBeLessThan(p.scranBId);
    }
  });

  it("soft: early rounds tend to have larger average Δ than late rounds", () => {
    const candidates = buildFixtureCandidates(30);
    // Run a few trials so randomness is less flaky for the soft check.
    let earlySum = 0;
    let lateSum = 0;
    let trials = 0;

    for (let t = 0; t < 5; t++) {
      const result = selectCompetitivePairs({
        candidates,
        usedPairKeys: new Set(),
      });
      if (!result.ok) continue;
      trials += 1;
      const early = result.pairs.filter((p) => p.roundNumber <= 2);
      const late = result.pairs.filter((p) => p.roundNumber >= 8);
      earlySum += early.reduce((s, p) => s + p.deltaPp, 0) / early.length;
      lateSum += late.reduce((s, p) => s + p.deltaPp, 0) / late.length;
    }

    expect(trials).toBeGreaterThan(0);
    // Soft: mean early Δ should exceed mean late Δ with well-spread fixtures.
    expect(earlySum / trials).toBeGreaterThan(lateSum / trials);
  });

  it("respects historically used pair keys", () => {
    const candidates = buildFixtureCandidates(30);
    // Pre-block many close and wide pairs involving low ids.
    const blocked = new Set<string>();
    for (let a = 1; a <= 10; a++) {
      for (let b = a + 1; b <= 12; b++) {
        blocked.add(pairKey(a, b));
      }
    }

    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: blocked,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const p of result.pairs) {
      expect(blocked.has(p.pairKey)).toBe(false);
    }
  });

  it("fails when too few candidates for 10 pairs", () => {
    const candidates = buildFixtureCandidates(5);
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Not enough eligible candidates/i);
    expect(result.error).toContain(String(COMPETITIVE_ROUNDS * 2));
  });

  it("fails when candidates lack min votes", () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({
      scranId: i + 1,
      likes: 5,
      dislikes: 5, // total 10 < MIN_COMPETITIVE_VOTES
    }));
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Not enough eligible/i);
    expect(result.error).toContain(String(MIN_COMPETITIVE_VOTES));
  });

  it("honors custom rounds count", () => {
    const candidates = buildFixtureCandidates(30);
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
      rounds: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs).toHaveLength(3);
    expect(result.pairs.map((p) => p.roundNumber)).toEqual([1, 2, 3]);
  });

  it("widens maxDelta when band is empty but easier pairs exist", () => {
    // Two candidates only: Δ = 30pp. Band 1 wants 12–25 → must widen max to ≥30.
    // Enough filler candidates with identical pct so they cannot pair with each other
    // (equal pct) but the two distinct ones can form the needed pair after widen.
    const candidates = [
      { scranId: 1, likes: 80, dislikes: 20 }, // 80%
      { scranId: 2, likes: 50, dislikes: 50 }, // 50% → Δ=30
      // fillers with same pct as #1 so they only pair with #2 (also Δ=30)
      ...Array.from({ length: 18 }, (_, i) => ({
        scranId: i + 3,
        likes: 80,
        dislikes: 20,
      })),
    ];

    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
      rounds: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.deltaPp).toBeCloseTo(30);
    // Band for round 1 is 12–25; 30 required widening.
    const band = bandForRound(1);
    expect(result.pairs[0]!.deltaPp).toBeGreaterThan(band.maxDelta);
  });

  it("fails when no valid pairs even after widening to 40", () => {
    // All candidates share the same like rate → only delta 0 pairs (forbidden).
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      scranId: i + 1,
      likes: 50,
      dislikes: 50,
    }));
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
      rounds: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not select a pair for round 1/i);
  });

  it("preserves frozen likes/dislikes from candidates on selected pairs", () => {
    const candidates = buildFixtureCandidates(30);
    const byId = new Map(candidates.map((c) => [c.scranId, c]));
    const result = selectCompetitivePairs({
      candidates,
      usedPairKeys: new Set(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const p of result.pairs) {
      const a = byId.get(p.scranAId)!;
      const b = byId.get(p.scranBId)!;
      expect(p.likesA).toBe(a.likes);
      expect(p.dislikesA).toBe(a.dislikes);
      expect(p.likesB).toBe(b.likes);
      expect(p.dislikesB).toBe(b.dislikes);
    }
  });
});

describe("isMskDateInSeasonWindow (half-open [startsAt, endsAt))", () => {
  // Season: 2024-07-01 00:00 MSK inclusive → 2024-08-01 00:00 MSK exclusive
  const startsAt = mskDateStartUtc("2024-07-01");
  const endsAt = mskDateStartUtc("2024-08-01");

  it("includes the first MSK day of the season", () => {
    expect(isMskDateInSeasonWindow("2024-07-01", startsAt, endsAt)).toBe(true);
  });

  it("includes a mid-season MSK day", () => {
    expect(isMskDateInSeasonWindow("2024-07-15", startsAt, endsAt)).toBe(true);
  });

  it("includes the last full MSK day before endsAt midnight", () => {
    expect(isMskDateInSeasonWindow("2024-07-31", startsAt, endsAt)).toBe(true);
  });

  it("excludes the endsAt MSK calendar day (half-open)", () => {
    expect(isMskDateInSeasonWindow("2024-08-01", startsAt, endsAt)).toBe(false);
  });

  it("excludes days before startsAt", () => {
    expect(isMskDateInSeasonWindow("2024-06-30", startsAt, endsAt)).toBe(false);
  });

  it("includes partial first day when season starts midday MSK", () => {
    // starts 2024-07-01 12:00 MSK = 09:00 UTC
    const middayStart = new Date("2024-07-01T09:00:00.000Z");
    expect(isMskDateInSeasonWindow("2024-07-01", middayStart, endsAt)).toBe(
      true,
    );
    expect(isMskDateInSeasonWindow("2024-06-30", middayStart, endsAt)).toBe(
      false,
    );
  });

  it("includes partial last day when endsAt is evening MSK", () => {
    // ends 2024-07-31 18:00 MSK = 15:00 UTC → still overlaps 2024-07-31
    const eveningEnd = new Date("2024-07-31T15:00:00.000Z");
    expect(isMskDateInSeasonWindow("2024-07-31", startsAt, eveningEnd)).toBe(
      true,
    );
    expect(isMskDateInSeasonWindow("2024-08-01", startsAt, eveningEnd)).toBe(
      false,
    );
  });
});
