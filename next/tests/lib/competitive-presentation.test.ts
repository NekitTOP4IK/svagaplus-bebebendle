import { describe, it, expect } from "vitest";
import {
  presentRounds,
  presentationSeed,
} from "@/lib/competitive/presentation";

const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
  id: n * 10,
  roundNumber: n,
  scranAId: n * 2,
  scranBId: n * 2 + 1,
  likesA: 10,
  dislikesA: 0,
  likesB: 5,
  dislikesB: 5,
}));

describe("presentRounds", () => {
  it("is stable for same seed", () => {
    const seed = presentationSeed("pepper", 1, "2026-07-24", 99);
    const a = presentRounds(base, seed);
    const b = presentRounds(base, seed);
    expect(a.map((r) => r.roundId)).toEqual(b.map((r) => r.roundId));
    expect(a.map((r) => r.flipped)).toEqual(b.map((r) => r.flipped));
  });

  it("differs across users (usually)", () => {
    const s1 = presentationSeed("pepper", 1, "2026-07-24", 99);
    const s2 = presentationSeed("pepper", 2, "2026-07-24", 99);
    const a = presentRounds(base, s1).map((r) => r.roundId).join(",");
    const b = presentRounds(base, s2).map((r) => r.roundId).join(",");
    // Extremely unlikely equal for N=10; if flaky, assert seed buffers differ
    expect(s1.equals(s2)).toBe(false);
    expect(a === b).toBe(false);
  });

  it("preserves multiset of roundIds", () => {
    const seed = presentationSeed("pepper", 7, "2026-07-24", 1);
    const out = presentRounds(base, seed);
    expect(out.map((r) => r.roundId).sort()).toEqual(
      base.map((r) => r.id).sort(),
    );
  });

  it("flip swaps scran ids", () => {
    const seed = presentationSeed("pepper", 1, "2026-07-24", 99);
    const out = presentRounds(base, seed);
    for (const row of out) {
      const canon = base.find((c) => c.id === row.roundId)!;
      if (row.flipped) {
        expect(row.scranAId).toBe(canon.scranBId);
        expect(row.scranBId).toBe(canon.scranAId);
      } else {
        expect(row.scranAId).toBe(canon.scranAId);
      }
    }
  });

  it("assigns displayRoundNumber 1..N in presentation order", () => {
    const seed = presentationSeed("pepper", 3, "2026-07-24", 42);
    const out = presentRounds(base, seed);
    expect(out.map((r) => r.displayRoundNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("flip also swaps likes/dislikes sides", () => {
    const seed = presentationSeed("pepper", 1, "2026-07-24", 99);
    const out = presentRounds(base, seed);
    for (const row of out) {
      const canon = base.find((c) => c.id === row.roundId)!;
      if (row.flipped) {
        expect(row.likesA).toBe(canon.likesB);
        expect(row.dislikesA).toBe(canon.dislikesB);
        expect(row.likesB).toBe(canon.likesA);
        expect(row.dislikesB).toBe(canon.dislikesA);
      } else {
        expect(row.likesA).toBe(canon.likesA);
        expect(row.likesB).toBe(canon.likesB);
      }
    }
  });
});
