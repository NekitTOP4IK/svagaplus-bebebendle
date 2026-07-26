import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Focused coverage for getHubPayload's myWindow construction — the piece the
 * review round found untested. Everything that touches Postgres or app
 * settings is stubbed; getSeasonBoard is the seam under test.
 */

const TEST_USER_ID = 999;

const { dbSelectQueue, mockDb } = vi.hoisted(() => {
  const dbSelectQueue: unknown[][] = [];
  function makeChain() {
    const rows = dbSelectQueue.shift() ?? [];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  }
  const mockDb = { select: vi.fn(() => makeChain()) };
  return { dbSelectQueue, mockDb };
});

vi.mock("@/db/schema", () => ({
  db: mockDb,
  users: {
    id: "id",
    competitiveDisplayName: "competitiveDisplayName",
    telegramUsername: "telegramUsername",
    competitiveStreakFreezeSeasonId: "competitiveStreakFreezeSeasonId",
    competitiveStreakFreezeUsedAt: "competitiveStreakFreezeUsedAt",
    competitiveStreakFreezeDate: "competitiveStreakFreezeDate",
  },
  competitiveDailies: { id: "id", date: "date" },
  competitiveResults: {
    userId: "userId",
    date: "date",
    seasonId: "seasonId",
    points: "points",
  },
}));

vi.mock("@/lib/app-settings", () => ({
  getSetting: vi.fn(async () => ""),
}));

vi.mock("@/lib/competitive/feature", () => ({
  isCompetitiveEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/competitive/user-prefs", () => ({
  getCompetitiveUserPrefs: vi.fn(async () => ({
    introDismissed: true,
    nickPromptDismissed: true,
  })),
}));

vi.mock("@/lib/competitive/seasons", () => ({
  ensureSeasonTransitions: vi.fn(async () => {}),
  getVisibleSeason: vi.fn(),
  getLatestEndedSeason: vi.fn(async () => null),
}));

vi.mock("@/lib/competitive/standings", () => ({
  getSeasonBoard: vi.fn(),
}));

const { getHubPayload } = await import("@/lib/competitive/hub");
const { getSeasonBoard } = await import("@/lib/competitive/standings");
const { getVisibleSeason } = await import("@/lib/competitive/seasons");

const SEASON = {
  id: 7,
  name: "Season 7",
  status: "active" as const,
  startsAt: new Date("2026-07-01T00:00:00Z"),
  endsAt: new Date("2026-08-01T00:00:00Z"),
  themeKey: null,
  themeConfig: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

/** The outer per-user label — must win on the caller's own row over row.label. */
const OUTER_LABEL = "OuterLabel";

function topRows(count: number, opts: { place: number; userId: number } | null = null) {
  return Array.from({ length: count }, (_, index) => {
    const place = index + 1;
    return {
      place,
      userId: place === opts?.place ? opts.userId : place,
      points: 1000 - place,
      daysPlayed: 3,
      hits: 2,
      label: `Row${place}`,
    };
  });
}

function neighbourRow(place: number, userId: number, label: string) {
  return { place, userId, points: 10, daysPlayed: 1, hits: 0, label };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbSelectQueue.length = 0;
  vi.mocked(getVisibleSeason).mockResolvedValue(SEASON);
  // user select, dailyRow select, todayResult select, resultDateRows select — in that order.
  dbSelectQueue.push(
    [
      {
        id: TEST_USER_ID,
        competitiveDisplayName: OUTER_LABEL,
        telegramUsername: null,
        competitiveStreakFreezeSeasonId: null,
        competitiveStreakFreezeUsedAt: null,
        competitiveStreakFreezeDate: null,
      },
    ],
    [],
    [],
    [],
  );
});

describe("getHubPayload myWindow construction", () => {
  it("gives the caller at the last top place only the one contiguous neighbour beyond it", async () => {
    const rows = [
      ...topRows(50, { place: 50, userId: TEST_USER_ID }),
      neighbourRow(51, 51, "Row51"),
    ];
    vi.mocked(getSeasonBoard).mockResolvedValue({ rows, myPlace: 50 });

    const payload = await getHubPayload(TEST_USER_ID, new Date("2026-07-26T12:00:00Z"));

    expect(payload.myWindow.map((r) => r.place)).toEqual([51]);
    expect(payload.myWindow[0]!.isMe).toBe(false);
    expect(payload.myWindow[0]!.label).toBe("Row51");
    expect(getSeasonBoard).toHaveBeenCalledWith(
      expect.objectContaining({ topN: 50, windowRadius: 1 }),
    );
  });

  it("gives the caller one place inside the top no extra window rows", async () => {
    const rows = topRows(50, { place: 49, userId: TEST_USER_ID });
    vi.mocked(getSeasonBoard).mockResolvedValue({ rows, myPlace: 49 });

    const payload = await getHubPayload(TEST_USER_ID, new Date("2026-07-26T12:00:00Z"));

    expect(payload.myWindow).toEqual([]);
  });

  it("gives a caller far outside the top their neighbours, with the caller's own row using the outer label", async () => {
    const rows = [
      ...topRows(50),
      neighbourRow(199, 199, "Neighbour199"),
      neighbourRow(200, TEST_USER_ID, "ShouldNotBeUsed"),
      neighbourRow(201, 201, "Neighbour201"),
    ];
    vi.mocked(getSeasonBoard).mockResolvedValue({ rows, myPlace: 200 });

    const payload = await getHubPayload(TEST_USER_ID, new Date("2026-07-26T12:00:00Z"));

    expect(payload.myWindow.map((r) => r.place)).toEqual([199, 200, 201]);

    const mine = payload.myWindow.find((r) => r.place === 200)!;
    expect(mine.isMe).toBe(true);
    expect(mine.label).toBe(OUTER_LABEL);
    expect(mine.label).not.toBe("ShouldNotBeUsed");

    const before = payload.myWindow.find((r) => r.place === 199)!;
    const after = payload.myWindow.find((r) => r.place === 201)!;
    expect(before.label).toBe("Neighbour199");
    expect(before.isMe).toBe(false);
    expect(after.label).toBe("Neighbour201");
    expect(after.isMe).toBe(false);
  });
});
