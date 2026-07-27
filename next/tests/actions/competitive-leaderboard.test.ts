// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  checkRateLimit: vi.fn(),
  getPlayableSeason: vi.fn(),
  getSeasonLeaderboardPage: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getCurrentUser: dependencies.getCurrentUser }));
vi.mock("@/app/api/middleware/rateLimit", () => ({ checkRateLimit: dependencies.checkRateLimit }));
vi.mock("@/lib/competitive/seasons", () => ({ getPlayableSeason: dependencies.getPlayableSeason }));
vi.mock("@/lib/competitive/standings", () => ({ getSeasonLeaderboardPage: dependencies.getSeasonLeaderboardPage }));
vi.mock("@/lib/competitive/play", () => ({
  finalizeCompetitive: vi.fn(),
  getCompetitiveDailyView: vi.fn(),
  recordCompetitiveVote: vi.fn(),
}));
vi.mock("@/lib/daily-timezone", () => ({ todayMskDate: () => "2026-07-26" }));
vi.mock("@/lib/competitive/user-prefs", () => ({ patchCompetitiveUserPrefs: vi.fn() }));

import { loadSeasonLeaderboardPage } from "@/app/actions/competitive";

describe("loadSeasonLeaderboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dependencies.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 60_000 });
  });

  it("rejects an unauthenticated caller", async () => {
    dependencies.getCurrentUser.mockResolvedValue(null);

    await expect(loadSeasonLeaderboardPage({ offset: 0, limit: 25 })).resolves.toEqual({
      ok: false,
      code: "unauthorized",
      message: expect.any(String),
    });
    expect(dependencies.getSeasonLeaderboardPage).not.toHaveBeenCalled();
  });

  it.each([
    { offset: -1, limit: 25 },
    { offset: 1.5, limit: 25 },
    { offset: 0, limit: 0 },
    { offset: 0, limit: 26 },
    { offset: 0, limit: 1000 },
    { offset: 0, limit: 1.5 },
  ])("rejects invalid_input for %j and never queries getSeasonLeaderboardPage", async (input) => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 7 });

    await expect(loadSeasonLeaderboardPage(input)).resolves.toEqual({
      ok: false,
      code: "invalid_input",
      message: expect.any(String),
    });
    expect(dependencies.getSeasonLeaderboardPage).toHaveBeenCalledTimes(0);
  });

  it("returns failed when there is no playable season, without throwing", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 7 });
    dependencies.getPlayableSeason.mockResolvedValue(null);

    await expect(loadSeasonLeaderboardPage({ offset: 0, limit: 25 })).resolves.toEqual({
      ok: false,
      code: "failed",
      message: expect.any(String),
    });
    expect(dependencies.getSeasonLeaderboardPage).not.toHaveBeenCalled();
  });

  it("returns rate_limited without querying the season or the page", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 7 });
    dependencies.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

    await expect(loadSeasonLeaderboardPage({ offset: 0, limit: 25 })).resolves.toEqual({
      ok: false,
      code: "rate_limited",
      message: expect.any(String),
    });
    expect(dependencies.getPlayableSeason).not.toHaveBeenCalled();
    expect(dependencies.getSeasonLeaderboardPage).not.toHaveBeenCalled();
  });

  it("passes the resolved season id and the caller's own user id through on the happy path", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 7 });
    dependencies.getPlayableSeason.mockResolvedValue({ id: 42 });
    const page = { rows: [], total: 0, myPlace: null, myRow: null };
    dependencies.getSeasonLeaderboardPage.mockResolvedValue(page);

    await expect(loadSeasonLeaderboardPage({ offset: 25, limit: 25 })).resolves.toEqual({
      ok: true,
      data: page,
    });
    expect(dependencies.getSeasonLeaderboardPage).toHaveBeenCalledTimes(1);
    expect(dependencies.getSeasonLeaderboardPage).toHaveBeenCalledWith({
      seasonId: 42,
      userId: 7,
      offset: 25,
      limit: 25,
    });
  });
});
