import { describe, it, expect } from "vitest";
import {
  computeQueueScore,
  interleaveQueue,
  canUserSubmitMore,
  type ScranWithMeta,
} from "@/lib/moderation-queue";

describe("moderation-queue", () => {
  const baseScran = (overrides: Partial<ScranWithMeta> = {}): ScranWithMeta => ({
    id: 100,
    imageUrl: "https://example.com/img.jpg",
    name: "Test Scran",
    description: null,
    price: 100,
    numberOfLikes: 0,
    numberOfDislikes: 0,
    approved: false,
    isSubscriberAtSubmit: false,
    submittedByUserId: null,
    telegramId: "12345",
    ...overrides,
  });

  describe("computeQueueScore", () => {
    it("gives subscriber bonus of 1200", () => {
      const sub = baseScran({ isSubscriberAtSubmit: true, id: 10 });
      const reg = baseScran({ isSubscriberAtSubmit: false, id: 10 });
      const scoreSub = computeQueueScore(sub, 1, 0);
      const scoreReg = computeQueueScore(reg, 1, 0);
      expect(scoreSub).toBe(1200);
      expect(scoreReg).toBe(0);
    });

    it("adds waiting hours contribution", () => {
      const scran = baseScran({ isSubscriberAtSubmit: false });
      const s0 = computeQueueScore(scran, 1, 0);
      const s5 = computeQueueScore(scran, 1, 5);
      expect(s5).toBeGreaterThan(s0);
      expect(s5 - s0).toBe(40); // 5 * 8
    });

    it("applies flood penalty capped at 6", () => {
      const scran = baseScran({ isSubscriberAtSubmit: false });
      const p1 = computeQueueScore(scran, 1, 0);
      const p2 = computeQueueScore(scran, 2, 0);
      const p7 = computeQueueScore(scran, 7, 0);
      const p8 = computeQueueScore(scran, 8, 0);

      expect(p2).toBe(p1 - 35);
      expect(p7).toBe(p1 - 6 * 35);
      expect(p8).toBe(p7); // cap at 6
    });

    it("combines subscriber + wait - penalty correctly", () => {
      const scran = baseScran({ isSubscriberAtSubmit: true });
      const score = computeQueueScore(scran, 3, 2);
      // 1200 + 16 - 2*35 = 1200 + 16 - 70 = 1146
      expect(score).toBe(1146);
    });

    it("handles null/undefined gracefully", () => {
      const scran = baseScran({ isSubscriberAtSubmit: null });
      const score = computeQueueScore(scran, 0, 0);
      expect(score).toBe(0);
    });
  });

  describe("interleaveQueue", () => {
    it("produces 3:1 ratio when both lists have items", () => {
      const subs: ScranWithMeta[] = [
        baseScran({ id: 1, name: "s1" }),
        baseScran({ id: 2, name: "s2" }),
        baseScran({ id: 3, name: "s3" }),
        baseScran({ id: 4, name: "s4" }),
      ];
      const regs: ScranWithMeta[] = [
        baseScran({ id: 10, name: "r1" }),
        baseScran({ id: 11, name: "r2" }),
      ];

      const result = interleaveQueue(subs, regs);

      // s1,s2,s3, r1, s4, r2
      expect(result.map((r) => r.name)).toEqual(["s1", "s2", "s3", "r1", "s4", "r2"]);
    });

    it("handles more regulars than fit the ratio", () => {
      const subs: ScranWithMeta[] = [baseScran({ id: 1, name: "s1" })];
      const regs: ScranWithMeta[] = [
        baseScran({ id: 10, name: "r1" }),
        baseScran({ id: 11, name: "r2" }),
        baseScran({ id: 12, name: "r3" }),
      ];

      const result = interleaveQueue(subs, regs);
      expect(result.map((r) => r.name)).toEqual(["s1", "r1", "r2", "r3"]);
    });

    it("handles empty subscriber list (returns only regulars)", () => {
      const subs: ScranWithMeta[] = [];
      const regs: ScranWithMeta[] = [
        baseScran({ id: 10, name: "r1" }),
        baseScran({ id: 11, name: "r2" }),
      ];
      const result = interleaveQueue(subs, regs);
      expect(result.map((r) => r.name)).toEqual(["r1", "r2"]);
    });

    it("handles empty regular list (returns all subscribers)", () => {
      const subs: ScranWithMeta[] = [
        baseScran({ id: 1, name: "s1" }),
        baseScran({ id: 2, name: "s2" }),
      ];
      const regs: ScranWithMeta[] = [];
      const result = interleaveQueue(subs, regs);
      expect(result.map((r) => r.name)).toEqual(["s1", "s2"]);
    });

    it("handles both empty", () => {
      const result = interleaveQueue([], []);
      expect(result).toEqual([]);
    });

    it("preserves order within buckets (already sorted by caller)", () => {
      const subs: ScranWithMeta[] = [
        baseScran({ id: 5, name: "high" }),
        baseScran({ id: 6, name: "low" }),
      ];
      const regs: ScranWithMeta[] = [baseScran({ id: 20, name: "reg" })];
      const result = interleaveQueue(subs, regs);
      expect(result.map((r) => r.name)).toEqual(["high", "low", "reg"]);
    });
  });

  describe("canUserSubmitMore (max 6 enforcement)", () => {
    it("allows when <6 pending", () => {
      expect(canUserSubmitMore(0)).toBe(true);
      expect(canUserSubmitMore(5)).toBe(true);
    });
    it("rejects at 6 or more", () => {
      expect(canUserSubmitMore(6)).toBe(false);
      expect(canUserSubmitMore(7)).toBe(false);
    });
    it("handles zero as allowed", () => {
      expect(canUserSubmitMore(0)).toBe(true);
    });
  });

  describe("hybrid queue ordering (score + 3:1 interleave)", () => {
    it("orders subscribers ahead within buckets then interleaves 3:1", () => {
      // Create scrans with different wait times (hoursWaiting simulated)
      // subs should score higher due to 1200, regulars rely on wait
      const subOld = baseScran({ id: 1, name: "sub-old", isSubscriberAtSubmit: true });
      const subNew = baseScran({ id: 2, name: "sub-new", isSubscriberAtSubmit: true });
      const regOld = baseScran({ id: 10, name: "reg-old", isSubscriberAtSubmit: false });
      const regNew = baseScran({ id: 11, name: "reg-new", isSubscriberAtSubmit: false });

      // simulate caller sorting each bucket by score desc
      const subsSorted = [subOld, subNew].sort((a, b) =>
        computeQueueScore(b, 1, 10) - computeQueueScore(a, 1, 10)
      );
      const regsSorted = [regOld, regNew].sort((a, b) =>
        computeQueueScore(b, 1, 10) - computeQueueScore(a, 1, 10)
      );

      const queued = interleaveQueue(subsSorted, regsSorted);
      // Expect subs prioritized in groups of 3 then regular
      expect(queued.map((r) => r.name)).toEqual(["sub-old", "sub-new", "reg-old", "reg-new"]);
      // subscriber scores are high
      expect(computeQueueScore(subOld, 1, 0)).toBe(1200);
      expect(computeQueueScore(regOld, 1, 0)).toBe(0);
    });
  });
});
