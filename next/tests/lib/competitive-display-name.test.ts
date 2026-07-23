import { describe, it, expect } from "vitest";
import {
  validateCompetitiveDisplayName,
  leaderboardLabel,
  canChangeDisplayName,
  COMPETITIVE_DISPLAY_NAME_COOLDOWN_MS,
  COMPETITIVE_DISPLAY_NAME_MAX,
  COMPETITIVE_DISPLAY_NAME_MIN,
} from "@/lib/competitive/display-name";
import {
  addCalendarDays,
  computeStreakDays,
  compareStandingsRank,
  seasonDayNumber,
} from "@/lib/competitive/hub";

describe("validateCompetitiveDisplayName", () => {
  it("accepts valid latin nick", () => {
    const r = validateCompetitiveDisplayName("Ace_Player");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.name).toBe("Ace_Player");
  });

  it("accepts cyrillic", () => {
    const r = validateCompetitiveDisplayName("Игрок-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.name).toBe("Игрок-1");
  });

  it("trims whitespace", () => {
    const r = validateCompetitiveDisplayName("  Bebe  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.name).toBe("Bebe");
  });

  it("accepts min length 2", () => {
    const r = validateCompetitiveDisplayName("ab");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.name).toBe("ab");
    expect(COMPETITIVE_DISPLAY_NAME_MIN).toBe(2);
  });

  it("accepts max length 24", () => {
    const name = "a".repeat(COMPETITIVE_DISPLAY_NAME_MAX);
    const r = validateCompetitiveDisplayName(name);
    expect(r.ok).toBe(true);
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateCompetitiveDisplayName("").ok).toBe(false);
    expect(validateCompetitiveDisplayName("   ").ok).toBe(false);
  });

  it("rejects too short", () => {
    const r = validateCompetitiveDisplayName("a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least/i);
  });

  it("rejects too long", () => {
    const r = validateCompetitiveDisplayName("a".repeat(25));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at most/i);
  });

  it("rejects invalid charset (spaces, emoji, symbols)", () => {
    expect(validateCompetitiveDisplayName("a b").ok).toBe(false);
    expect(validateCompetitiveDisplayName("ace!").ok).toBe(false);
    expect(validateCompetitiveDisplayName("🔥ace").ok).toBe(false);
    expect(validateCompetitiveDisplayName("name@tg").ok).toBe(false);
  });

  it("rejects non-string", () => {
    expect(validateCompetitiveDisplayName(null).ok).toBe(false);
    expect(validateCompetitiveDisplayName(123).ok).toBe(false);
    expect(validateCompetitiveDisplayName(undefined).ok).toBe(false);
  });
});

describe("leaderboardLabel", () => {
  it("prefers competitiveDisplayName", () => {
    expect(
      leaderboardLabel({
        id: 1,
        competitiveDisplayName: "  Ace  ",
        telegramUsername: "tg_user",
      }),
    ).toBe("Ace");
  });

  it("falls back to @telegramUsername", () => {
    expect(
      leaderboardLabel({
        id: 2,
        competitiveDisplayName: null,
        telegramUsername: "bebeb",
      }),
    ).toBe("@bebeb");
  });

  it("keeps leading @ on telegram username", () => {
    expect(
      leaderboardLabel({
        id: 3,
        competitiveDisplayName: null,
        telegramUsername: "@already",
      }),
    ).toBe("@already");
  });

  it("falls back to Игрок #id", () => {
    expect(
      leaderboardLabel({
        id: 42,
        competitiveDisplayName: null,
        telegramUsername: null,
      }),
    ).toBe("Игрок #42");
  });

  it("treats blank competitive name as missing", () => {
    expect(
      leaderboardLabel({
        id: 5,
        competitiveDisplayName: "   ",
        telegramUsername: "x",
      }),
    ).toBe("@x");
  });
});

describe("canChangeDisplayName (24h rate limit)", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("allows first change when updatedAt is null", () => {
    expect(canChangeDisplayName(null, now).ok).toBe(true);
  });

  it("blocks within 24h", () => {
    const updatedAt = new Date(now.getTime() - 60 * 60 * 1000);
    const r = canChangeDisplayName(updatedAt, now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
      expect(r.retryAfterMs).toBeLessThanOrEqual(
        COMPETITIVE_DISPLAY_NAME_COOLDOWN_MS,
      );
    }
  });

  it("allows after 24h", () => {
    const updatedAt = new Date(
      now.getTime() - COMPETITIVE_DISPLAY_NAME_COOLDOWN_MS,
    );
    expect(canChangeDisplayName(updatedAt, now).ok).toBe(true);
  });
});

describe("computeStreakDays", () => {
  const today = "2026-07-23";

  it("returns 0 when neither today nor yesterday has a result", () => {
    expect(computeStreakDays(["2026-07-20", "2026-07-21"], today)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    expect(
      computeStreakDays(
        ["2026-07-21", "2026-07-22", "2026-07-23"],
        today,
      ),
    ).toBe(3);
  });

  it("counts streak ending yesterday if today missed", () => {
    expect(
      computeStreakDays(["2026-07-21", "2026-07-22"], today),
    ).toBe(2);
  });

  it("stops at first gap", () => {
    expect(
      computeStreakDays(
        ["2026-07-20", "2026-07-22", "2026-07-23"],
        today,
      ),
    ).toBe(2);
  });

  it("single day today is streak 1", () => {
    expect(computeStreakDays([today], today)).toBe(1);
  });

  it("single day yesterday is streak 1", () => {
    expect(computeStreakDays(["2026-07-22"], today)).toBe(1);
  });
});

describe("addCalendarDays", () => {
  it("steps across month boundary", () => {
    expect(addCalendarDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("compareStandingsRank", () => {
  it("orders by points, then days, then hits, then userId", () => {
    const rows = [
      { userId: 3, points: 100, daysPlayed: 5, hits: 40 },
      { userId: 1, points: 100, daysPlayed: 5, hits: 50 },
      { userId: 2, points: 200, daysPlayed: 1, hits: 10 },
      { userId: 4, points: 100, daysPlayed: 6, hits: 10 },
      { userId: 5, points: 100, daysPlayed: 5, hits: 50 },
    ];
    const sorted = [...rows].sort(compareStandingsRank);
    expect(sorted.map((r) => r.userId)).toEqual([2, 4, 1, 5, 3]);
  });
});

describe("seasonDayNumber", () => {
  it("is 1 on season start MSK day", () => {
    // 2026-08-01 00:00 MSK = 2026-07-31 21:00 UTC
    expect(seasonDayNumber("2026-07-31T21:00:00.000Z", "2026-08-01")).toBe(1);
  });

  it("increments by calendar day", () => {
    expect(seasonDayNumber("2026-07-31T21:00:00.000Z", "2026-08-05")).toBe(5);
  });
});
