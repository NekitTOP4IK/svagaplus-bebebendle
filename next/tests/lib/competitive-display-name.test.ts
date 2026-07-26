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
  computeSeasonStreakDays,
  freezeAvailableForSeason,
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

  it("falls back to telegramUsername without @", () => {
    expect(
      leaderboardLabel({
        id: 2,
        competitiveDisplayName: null,
        telegramUsername: "bebeb",
      }),
    ).toBe("bebeb");
  });

  it("strips leading @ from telegram username", () => {
    expect(
      leaderboardLabel({
        id: 3,
        competitiveDisplayName: null,
        telegramUsername: "@already",
      }),
    ).toBe("already");
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
    ).toBe("x");
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

  // Clear (null) bypasses this pure helper — enforced in setCompetitiveDisplayName.

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
    expect(computeStreakDays(["2026-07-20", "2026-07-21"], today)).toEqual({
      days: 0,
      freezeConsumed: false,
    });
  });

  it("counts consecutive days ending today", () => {
    expect(
      computeStreakDays(
        ["2026-07-21", "2026-07-22", "2026-07-23"],
        today,
      ),
    ).toEqual({ days: 3, freezeConsumed: false });
  });

  it("counts streak ending yesterday if today missed", () => {
    expect(
      computeStreakDays(["2026-07-21", "2026-07-22"], today),
    ).toEqual({ days: 2, freezeConsumed: false });
  });

  it("stops at first gap without freeze", () => {
    expect(
      computeStreakDays(
        ["2026-07-20", "2026-07-22", "2026-07-23"],
        today,
      ),
    ).toEqual({ days: 2, freezeConsumed: false });
  });

  it("single day today is streak 1", () => {
    expect(computeStreakDays([today], today)).toEqual({
      days: 1,
      freezeConsumed: false,
    });
  });

  it("single day yesterday is streak 1", () => {
    expect(computeStreakDays(["2026-07-22"], today)).toEqual({
      days: 1,
      freezeConsumed: false,
    });
  });

  it("freeze bridges a mid-chain gap without counting the miss day", () => {
    // played 20, 21, miss 22, played 23 — freeze covers 22 → days 3
    expect(
      computeStreakDays(
        ["2026-07-20", "2026-07-21", "2026-07-23"],
        today,
        { freezeAvailable: true },
      ),
    ).toEqual({ days: 3, freezeConsumed: true });
  });

  it("freeze extends head when yesterday missed and day-2 played", () => {
    // today empty, yesterday empty, day-2 played → start at day-2 with freeze
    expect(
      computeStreakDays(["2026-07-21", "2026-07-20"], today, {
        freezeAvailable: true,
      }),
    ).toEqual({ days: 2, freezeConsumed: true });
  });

  it("freeze does not inflate streak on the freeze day itself", () => {
    // 5 days chain with one freeze gap still counts only played days
    expect(
      computeStreakDays(
        ["2026-07-18", "2026-07-19", "2026-07-20", "2026-07-22", "2026-07-23"],
        today,
        { freezeAvailable: true },
      ),
    ).toEqual({ days: 5, freezeConsumed: true });
  });

  it("without freeze, day-2 head is not enough", () => {
    expect(
      computeStreakDays(["2026-07-21", "2026-07-20"], today),
    ).toEqual({ days: 0, freezeConsumed: false });
  });

  it("does not spend a freeze on a two-day gap", () => {
    // 19 played, miss 20+21, 22+23 played — one charge cannot bridge the pair.
    expect(
      computeStreakDays(
        ["2026-07-19", "2026-07-22", "2026-07-23"],
        today,
        { freezeAvailable: true },
      ),
    ).toEqual({ days: 2, freezeConsumed: false });
  });
});

describe("freezeAvailableForSeason", () => {
  it("makes a charge available until it has been used in the active season", () => {
    expect(freezeAvailableForSeason(null, 12)).toBe(true);
    expect(freezeAvailableForSeason(11, 12)).toBe(true);
    expect(freezeAvailableForSeason(12, 12)).toBe(false);
  });
});

describe("computeSeasonStreakDays", () => {
  const season = {
    startsAt: "2026-07-01T21:00:00.000Z",
    endsAt: "2026-08-01T21:00:00.000Z",
  };

  it("does not need a freeze when the player has played today", () => {
    expect(
      computeSeasonStreakDays(["2026-07-22", "2026-07-23"], season, "2026-07-23", true),
    ).toEqual({ days: 2, needsFreeze: false });
  });

  it("reports one actual in-season gap without consuming the charge", () => {
    expect(
      computeSeasonStreakDays(
        ["2026-07-20", "2026-07-21", "2026-07-23"],
        season,
        "2026-07-23",
        true,
      ),
    ).toEqual({ days: 3, needsFreeze: true });
  });

  it("keeps a recorded same-season freeze holding its one-day gap", () => {
    expect(
      computeSeasonStreakDays(
        ["2026-07-20", "2026-07-21", "2026-07-23"],
        season,
        "2026-07-23",
        false,
        "2026-07-22",
      ),
    ).toEqual({ days: 3, needsFreeze: false });
  });

  it("does not move a recorded freeze to a later gap", () => {
    expect(
      computeSeasonStreakDays(
        ["2026-07-20", "2026-07-21", "2026-07-23", "2026-07-24", "2026-07-26"],
        season,
        "2026-07-26",
        false,
        "2026-07-22",
      ),
    ).toEqual({ days: 1, needsFreeze: false });
  });

  it("does not bridge two missing days with one charge", () => {
    expect(
      computeSeasonStreakDays(
        ["2026-07-19", "2026-07-22", "2026-07-23"],
        season,
        "2026-07-23",
        true,
      ),
    ).toEqual({ days: 2, needsFreeze: false });
  });

  it("makes a charge available again for a new season", () => {
    expect(freezeAvailableForSeason(12, 13)).toBe(true);
    expect(
      computeSeasonStreakDays(
        ["2026-08-02", "2026-08-04"],
        {
          startsAt: "2026-07-31T21:00:00.000Z",
          endsAt: "2026-08-31T21:00:00.000Z",
        },
        "2026-08-04",
        freezeAvailableForSeason(12, 13),
      ),
    ).toEqual({ days: 2, needsFreeze: true });
  });
});

describe("addCalendarDays", () => {
  it("steps across month boundary", () => {
    expect(addCalendarDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addCalendarDays("2026-02-28", 1)).toBe("2026-03-01");
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
