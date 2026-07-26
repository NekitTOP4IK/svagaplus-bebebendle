import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  db: { select: dependencies.select },
  users: {
    id: "users.id",
    competitiveDisplayName: "users.competitive_display_name",
    telegramUsername: "users.telegram_username",
  },
  competitiveStandings: {
    userId: "standings.user_id",
    seasonId: "standings.season_id",
    points: "standings.points",
    daysPlayed: "standings.days_played",
    hits: "standings.hits",
  },
}));

import { compareStandingsRank, getSeasonRanking } from "@/lib/competitive/standings";

const hub = readFileSync(
  resolve(process.cwd(), "lib/competitive/hub.ts"),
  "utf8",
);

function mockSelectRows(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockResolvedValue(rows);
  return chain;
}

describe("compareStandingsRank", () => {
  it("orders by points, then days played, then hits, then user id", () => {
    const rows = [
      { userId: 4, points: 100, daysPlayed: 2, hits: 5 },
      { userId: 1, points: 200, daysPlayed: 1, hits: 1 },
      { userId: 3, points: 100, daysPlayed: 2, hits: 9 },
      { userId: 2, points: 100, daysPlayed: 3, hits: 1 },
    ];

    expect([...rows].sort(compareStandingsRank).map((row) => row.userId)).toEqual(
      [1, 2, 3, 4],
    );
  });

  it("breaks a full tie by the lower user id", () => {
    const a = { userId: 9, points: 10, daysPlayed: 1, hits: 1 };
    const b = { userId: 2, points: 10, daysPlayed: 1, hits: 1 };

    expect(compareStandingsRank(a, b)).toBeGreaterThan(0);
  });

  it("orders by points, then days, then hits, then userId across a mixed set", () => {
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

describe("hub standings", () => {
  it("sources its ranking from the shared query", () => {
    expect(hub).toContain("getSeasonRanking");
    expect(hub).not.toContain("export function compareStandingsRank");
  });
});

describe("getSeasonRanking", () => {
  beforeEach(() => {
    dependencies.select.mockReset();
  });

  it("labels each row from its own competitiveDisplayName or telegramUsername", async () => {
    dependencies.select.mockReturnValue(
      mockSelectRows([
        {
          userId: 1,
          points: 500,
          daysPlayed: 3,
          hits: 8,
          competitiveDisplayName: "Ace",
          telegramUsername: "@rawnick",
        },
        {
          userId: 2,
          points: 400,
          daysPlayed: 2,
          hits: 7,
          competitiveDisplayName: null,
          telegramUsername: "@nick",
        },
      ]),
    );

    const ranked = await getSeasonRanking(1);

    // A user with both fields set must be labelled from competitiveDisplayName,
    // not telegramUsername — this only holds if the fields reach leaderboardLabel
    // in the right order.
    expect(ranked.find((row) => row.userId === 1)?.label).toBe("Ace");
    // A user with only a telegramUsername must have it stripped of its leading @.
    expect(ranked.find((row) => row.userId === 2)?.label).toBe("nick");
  });

  it("re-sorts rows defensively even when the DB returns them out of rank order", async () => {
    dependencies.select.mockReturnValue(
      mockSelectRows([
        { userId: 2, points: 50, daysPlayed: 1, hits: 1, competitiveDisplayName: "B", telegramUsername: null },
        { userId: 1, points: 200, daysPlayed: 1, hits: 1, competitiveDisplayName: "A", telegramUsername: null },
        { userId: 3, points: 120, daysPlayed: 1, hits: 1, competitiveDisplayName: "C", telegramUsername: null },
      ]),
    );

    const ranked = await getSeasonRanking(1);

    expect(ranked.map((row) => row.userId)).toEqual([1, 3, 2]);
  });
});
