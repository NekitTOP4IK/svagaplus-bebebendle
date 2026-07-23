import { describe, it, expect } from "vitest";
import { canAddScranToPool } from "@/lib/competitive/pool";
import { MIN_COMPETITIVE_VOTES } from "@/lib/competitive/constants";

describe("canAddScranToPool", () => {
  const base = {
    approved: true,
    rejected: false,
    numberOfLikes: 10,
    numberOfDislikes: 5,
  };

  it("passes with exactly MIN_COMPETITIVE_VOTES total votes", () => {
    expect(MIN_COMPETITIVE_VOTES).toBe(15);
    const result = canAddScranToPool({
      ...base,
      numberOfLikes: 10,
      numberOfDislikes: 5,
    });
    expect(result).toEqual({ ok: true });
  });

  it("passes with more than MIN votes", () => {
    const result = canAddScranToPool({
      ...base,
      numberOfLikes: 100,
      numberOfDislikes: 50,
    });
    expect(result).toEqual({ ok: true });
  });

  it("fails with 14 votes (one under threshold)", () => {
    const result = canAddScranToPool({
      ...base,
      numberOfLikes: 7,
      numberOfDislikes: 7,
    });
    expect(result).toEqual({
      ok: false,
      error: `Нужно ≥${MIN_COMPETITIVE_VOTES} голосов`,
    });
  });

  it("fails with zero votes", () => {
    const result = canAddScranToPool({
      ...base,
      numberOfLikes: 0,
      numberOfDislikes: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(String(MIN_COMPETITIVE_VOTES));
    }
  });

  it("fails when not approved", () => {
    const result = canAddScranToPool({
      ...base,
      approved: false,
    });
    expect(result).toEqual({ ok: false, error: "Скран не одобрен" });
  });

  it("fails when rejected even if approved flag is true", () => {
    const result = canAddScranToPool({
      ...base,
      approved: true,
      rejected: true,
    });
    expect(result).toEqual({ ok: false, error: "Скран не одобрен" });
  });

  it("fails when rejected and not approved", () => {
    const result = canAddScranToPool({
      ...base,
      approved: false,
      rejected: true,
      numberOfLikes: 100,
      numberOfDislikes: 100,
    });
    expect(result).toEqual({ ok: false, error: "Скран не одобрен" });
  });

  it("approval failure takes precedence over vote count", () => {
    const result = canAddScranToPool({
      approved: false,
      rejected: false,
      numberOfLikes: 0,
      numberOfDislikes: 0,
    });
    expect(result).toEqual({ ok: false, error: "Скран не одобрен" });
  });
});
