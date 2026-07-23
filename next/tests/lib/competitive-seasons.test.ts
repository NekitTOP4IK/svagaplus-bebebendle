import { describe, it, expect } from "vitest";
import {
  shouldActivate,
  shouldEnd,
  snapshotDisplayName,
} from "@/lib/competitive/seasons";

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

  it("falls back to @telegramUsername", () => {
    expect(
      snapshotDisplayName({
        id: 2,
        competitiveDisplayName: null,
        telegramUsername: "bebeb",
      }),
    ).toBe("@bebeb");
  });

  it("keeps leading @ on telegram username", () => {
    expect(
      snapshotDisplayName({
        id: 2,
        competitiveDisplayName: "  ",
        telegramUsername: "@bebeb",
      }),
    ).toBe("@bebeb");
  });

  it("falls back to player#id", () => {
    expect(
      snapshotDisplayName({
        id: 42,
        competitiveDisplayName: null,
        telegramUsername: null,
      }),
    ).toBe("player#42");
  });
});
