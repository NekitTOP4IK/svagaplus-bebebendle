import { describe, it, expect } from "vitest";
import {
  isSeasonStatusPlayable,
  shouldActivate,
  shouldEnd,
  snapshotDisplayName,
} from "@/lib/competitive/seasons";

describe("isSeasonStatusPlayable (daily generation gate)", () => {
  it("only active is playable — never countdown", () => {
    expect(isSeasonStatusPlayable("active")).toBe(true);
    expect(isSeasonStatusPlayable("countdown")).toBe(false);
    expect(isSeasonStatusPlayable("draft")).toBe(false);
    expect(isSeasonStatusPlayable("ended")).toBe(false);
  });
});

describe("shouldActivate", () => {
  const startsAt = new Date("2026-07-01T00:00:00.000Z");

  it("activates countdown when now === startsAt", () => {
    expect(
      shouldActivate({ status: "countdown", startsAt }, startsAt),
    ).toBe(true);
  });

  it("activates countdown when now > startsAt", () => {
    expect(
      shouldActivate(
        { status: "countdown", startsAt },
        new Date("2026-07-01T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("does not activate countdown when now < startsAt", () => {
    expect(
      shouldActivate(
        { status: "countdown", startsAt },
        new Date("2026-06-30T23:59:59.999Z"),
      ),
    ).toBe(false);
  });

  it("does not activate draft / active / ended", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    expect(shouldActivate({ status: "draft", startsAt }, now)).toBe(false);
    expect(shouldActivate({ status: "active", startsAt }, now)).toBe(false);
    expect(shouldActivate({ status: "ended", startsAt }, now)).toBe(false);
  });
});

describe("shouldEnd", () => {
  const endsAt = new Date("2026-08-01T00:00:00.000Z");

  it("ends active when now === endsAt (half-open)", () => {
    expect(shouldEnd({ status: "active", endsAt }, endsAt)).toBe(true);
  });

  it("ends active when now > endsAt", () => {
    expect(
      shouldEnd(
        { status: "active", endsAt },
        new Date("2026-08-01T00:00:00.001Z"),
      ),
    ).toBe(true);
  });

  it("does not end active when now < endsAt", () => {
    expect(
      shouldEnd(
        { status: "active", endsAt },
        new Date("2026-07-31T23:59:59.999Z"),
      ),
    ).toBe(false);
  });

  it("does not end draft / countdown / ended", () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    expect(shouldEnd({ status: "draft", endsAt }, now)).toBe(false);
    expect(shouldEnd({ status: "countdown", endsAt }, now)).toBe(false);
    expect(shouldEnd({ status: "ended", endsAt }, now)).toBe(false);
  });
});

/**
 * Documents month-handoff intent for transitionSeasonsByTime (pure predicates only):
 * end overdue active first, then activate abutting countdown, then end again if needed.
 * Without ending first, assertSingleActive would block activation at the boundary.
 */
describe("month handoff predicates (abutting seasons)", () => {
  // July ends exactly when August starts (half-open [starts, ends)).
  const july = {
    status: "active" as const,
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const august = {
    status: "countdown" as const,
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2026-09-01T00:00:00.000Z"),
  };
  const boundary = new Date("2026-08-01T00:00:00.000Z");

  it("at boundary: July should end and August should activate", () => {
    expect(shouldEnd(july, boundary)).toBe(true);
    expect(shouldActivate(august, boundary)).toBe(true);
    // July is not a countdown; August is not active yet — order must be end then activate.
    expect(shouldActivate(july, boundary)).toBe(false);
    expect(shouldEnd(august, boundary)).toBe(false);
  });

  it("just before boundary: July stays active, August stays countdown", () => {
    const before = new Date("2026-07-31T23:59:59.999Z");
    expect(shouldEnd(july, before)).toBe(false);
    expect(shouldActivate(august, before)).toBe(false);
  });

  it("after activate, overdue (fully past) season still ends on second pass", () => {
    // Countdown that was never activated until long after endsAt.
    const overdueCountdown = {
      status: "countdown" as const,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(shouldActivate(overdueCountdown, now)).toBe(true);
    // Once activated (status becomes active), shouldEnd applies on the second end pass.
    const afterActivate = {
      status: "active" as const,
      endsAt: overdueCountdown.endsAt,
    };
    expect(shouldEnd(afterActivate, now)).toBe(true);
  });
});

describe("snapshotDisplayName", () => {
  it("prefers competitiveDisplayName", () => {
    expect(
      snapshotDisplayName({
        id: 1,
        competitiveDisplayName: "  Ace  ",
        telegramUsername: "tg_user",
      }),
    ).toBe("Ace");
  });

  it("falls back to telegramUsername without @", () => {
    expect(
      snapshotDisplayName({
        id: 2,
        competitiveDisplayName: null,
        telegramUsername: "bebeb",
      }),
    ).toBe("bebeb");
  });

  it("strips leading @ from telegram username", () => {
    expect(
      snapshotDisplayName({
        id: 2,
        competitiveDisplayName: "  ",
        telegramUsername: "@bebeb",
      }),
    ).toBe("bebeb");
  });

  it("falls back to Игрок #id", () => {
    expect(
      snapshotDisplayName({
        id: 42,
        competitiveDisplayName: null,
        telegramUsername: null,
      }),
    ).toBe("Игрок #42");
  });
});
