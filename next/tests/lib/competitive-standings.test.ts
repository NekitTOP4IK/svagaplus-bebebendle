import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  db: { execute: dependencies.execute },
}));

import { leaderboardLabel } from "@/lib/competitive/display-name";
import {
  compareStandingsRank,
  getSeasonBoard,
  getSeasonLeaderboardPage,
} from "@/lib/competitive/standings";

const hub = readFileSync(
  resolve(process.cwd(), "lib/competitive/hub.ts"),
  "utf8",
);
const standingsSrc = readFileSync(
  resolve(process.cwd(), "lib/competitive/standings.ts"),
  "utf8",
);
const seasonsSrc = readFileSync(
  resolve(process.cwd(), "lib/competitive/seasons.ts"),
  "utf8",
);

type StubSeasonBoardRow = {
  place: number;
  user_id: number;
  points: number;
  days_played: number;
  hits: number;
  competitive_display_name: string | null;
  telegram_username: string | null;
  my_place: number | null;
};

function stubBoardRow(
  place: number,
  overrides: Partial<StubSeasonBoardRow> = {},
): StubSeasonBoardRow {
  return {
    place,
    user_id: place,
    points: 1000 - place,
    days_played: 5,
    hits: 3,
    competitive_display_name: `Player${place}`,
    telegram_username: null,
    my_place: null,
    ...overrides,
  };
}

/**
 * Extracts the literal SQL text (minus interpolated params) from a drizzle-orm
 * `sql` tagged-template value, so a test can assert on the query shape without
 * a live database.
 */
function capturedSqlText(): string {
  const [query] = dependencies.execute.mock.calls.at(-1) ?? [];
  const chunks = (query as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (chunk && typeof chunk === "object" && "value" in (chunk as Record<string, unknown>)) {
        const value = (chunk as { value: unknown }).value;
        return Array.isArray(value) ? value.join("") : String(value ?? "");
      }
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
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
    expect(hub).toContain("getSeasonBoard");
    expect(hub).not.toContain("getSeasonRanking");
    expect(hub).not.toContain("export function compareStandingsRank");
  });
});

describe("getSeasonBoard", () => {
  beforeEach(() => {
    dependencies.execute.mockReset();
  });

  // NOTE: the next two tests stub the row set the SQL is trusted to have
  // already filtered/deduped. They verify that getSeasonBoard maps a given
  // row set through to SeasonBoardRow (place, myPlace, no reshuffling) —
  // they do NOT exercise the window/dedup predicate itself, since
  // getSeasonBoard applies no filtering of its own. See "ranks in SQL ..."
  // below for the test that actually pins that predicate.
  it("maps a stubbed top-slice row set through to SeasonBoardRow, place and myPlace intact", async () => {
    const rows = [1, 2, 3, 4, 5].map((place) =>
      stubBoardRow(place, { my_place: 3 }),
    );
    dependencies.execute.mockResolvedValue({ rows });

    const board = await getSeasonBoard({
      seasonId: 1,
      userId: 3,
      topN: 5,
      windowRadius: 0,
    });

    expect(board.rows.map((row) => row.place)).toEqual([1, 2, 3, 4, 5]);
    expect(board.rows.filter((row) => row.userId === 3)).toHaveLength(1);
    expect(board.myPlace).toBe(3);
  });

  it("maps a stubbed top-slice-plus-gap row set through to SeasonBoardRow, place and myPlace intact", async () => {
    const places = [1, 2, 3, 4, 5, 11, 12, 13];
    const rows = places.map((place) => stubBoardRow(place, { my_place: 12 }));
    dependencies.execute.mockResolvedValue({ rows });

    const board = await getSeasonBoard({
      seasonId: 1,
      userId: 12,
      topN: 5,
      windowRadius: 1,
    });

    expect(board.rows.map((row) => row.place)).toEqual(places);
    expect(board.myPlace).toBe(12);
  });

  // Pins the mapping layer: a six-row result for a place-5 caller (topN 5,
  // windowRadius 1) passes through intact, not truncated to five. The SQL
  // guarantee that this row set is what the query actually produces lives
  // in the "ranks in SQL ..." test below.
  it("includes the caller's neighbour beyond topN when the caller sits exactly at place topN", async () => {
    const rows = [1, 2, 3, 4, 5, 6].map((place) =>
      stubBoardRow(place, { my_place: 5 }),
    );
    dependencies.execute.mockResolvedValue({ rows });

    const board = await getSeasonBoard({
      seasonId: 1,
      userId: 5,
      topN: 5,
      windowRadius: 1,
    });

    expect(board.rows.map((row) => row.place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(board.myPlace).toBe(5);
  });

  // The deleted buildDayResultBoard end-clipped its window at the last
  // played place. The SQL has no clipping logic at all — it relies on rows
  // past the season's end simply not existing. Season has 8 players; caller
  // is last (place 8). Window radius 1 would reach place 9, which the stub
  // correctly omits because no such row exists.
  it("returns no fabricated row when the caller's window reaches past the last place in the season", async () => {
    const places = [1, 2, 3, 4, 5, 7, 8];
    const rows = places.map((place) => stubBoardRow(place, { my_place: 8 }));
    dependencies.execute.mockResolvedValue({ rows });

    const board = await getSeasonBoard({
      seasonId: 1,
      userId: 8,
      topN: 5,
      windowRadius: 1,
    });

    expect(board.rows.map((row) => row.place)).toEqual(places);
    expect(board.myPlace).toBe(8);
  });

  it("returns myPlace null when the caller has no standings row", async () => {
    const rows = [1, 2, 3, 4, 5].map((place) =>
      stubBoardRow(place, { my_place: null }),
    );
    dependencies.execute.mockResolvedValue({ rows });

    const board = await getSeasonBoard({
      seasonId: 1,
      userId: 999,
      topN: 5,
      windowRadius: 0,
    });

    expect(board.myPlace).toBeNull();
    expect(board.rows.map((row) => row.place)).toEqual([1, 2, 3, 4, 5]);
  });

  it("labels each row from its own competitive_display_name or telegram_username", async () => {
    const rows = [
      stubBoardRow(1, {
        user_id: 10,
        competitive_display_name: "Ace",
        telegram_username: "@rawnick",
      }),
      stubBoardRow(2, {
        user_id: 11,
        competitive_display_name: null,
        telegram_username: "@only",
      }),
    ];
    dependencies.execute.mockResolvedValue({ rows });

    const board = await getSeasonBoard({
      seasonId: 1,
      userId: 999,
      topN: 5,
      windowRadius: 0,
    });

    // Computed via the real leaderboardLabel with the fields in their correct
    // order, so this fails if the call site passes them swapped.
    expect(board.rows.find((row) => row.userId === 10)?.label).toBe(
      leaderboardLabel({
        id: 10,
        competitiveDisplayName: "Ace",
        telegramUsername: "@rawnick",
      }),
    );
    expect(board.rows.find((row) => row.userId === 11)?.label).toBe(
      leaderboardLabel({
        id: 11,
        competitiveDisplayName: null,
        telegramUsername: "@only",
      }),
    );
  });

  it("ranks in SQL with row_number() over the exact standings order, the bounded window predicate, and my_place, filtered to the season", async () => {
    dependencies.execute.mockResolvedValue({ rows: [] });

    await getSeasonBoard({ seasonId: 7, userId: 1, topN: 10, windowRadius: 1 });

    const text = capturedSqlText();
    expect(text).toContain(
      "row_number() OVER ( ORDER BY s.points DESC, s.days_played DESC, s.hits DESC, s.user_id ASC )",
    );
    expect(text).toContain("INNER JOIN users u ON u.id = s.user_id");
    expect(text).toContain("WHERE s.season_id =");
    // The window/dedup predicate: top slice OR the caller's own window.
    // This is the part that moved from tested JS into untested SQL — an
    // "optimisation" that drops the OR branch would scramble day-result
    // boards for anyone outside the top with every other test still green.
    expect(text).toContain(
      "WHERE r.place <= OR ((SELECT me.place FROM me) IS NOT NULL " +
        "AND r.place BETWEEN (SELECT me.place FROM me) - " +
        "AND (SELECT me.place FROM me) + )",
    );
    // Outer ORDER BY on the assigned place, not the CTE's internal ordering.
    expect(text).toContain(") ORDER BY r.place");
    expect(text).toContain("SELECT r.*, (SELECT me.place FROM me) AS my_place");
  });
});

type StubLeaderboardRow = {
  place: number;
  user_id: number;
  points: number;
  days_played: number;
  hits: number;
  competitive_display_name: string | null;
  telegram_username: string | null;
  total: number;
};

function stubLeaderboardRow(
  place: number,
  overrides: Partial<StubLeaderboardRow> = {},
): StubLeaderboardRow {
  return {
    place,
    user_id: place,
    points: 1000 - place,
    days_played: 5,
    hits: 3,
    competitive_display_name: `Player${place}`,
    telegram_username: null,
    total: 1000,
    ...overrides,
  };
}

describe("getSeasonLeaderboardPage", () => {
  beforeEach(() => {
    dependencies.execute.mockReset();
  });

  it("returns the requested slice in ascending place order", async () => {
    const places = Array.from({ length: 25 }, (_, i) => i + 26); // places 26..50
    const rows = places.map((place) => stubLeaderboardRow(place));
    dependencies.execute.mockResolvedValue({ rows });

    const page = await getSeasonLeaderboardPage({
      seasonId: 1,
      userId: 999,
      offset: 25,
      limit: 25,
    });

    expect(page.rows.map((row) => row.place)).toEqual(places);
  });

  it("excludes the caller from rows but reports them via myRow when they sit outside the slice", async () => {
    const places = Array.from({ length: 25 }, (_, i) => i + 26); // places 26..50
    const rows = [
      ...places.map((place) => stubLeaderboardRow(place)),
      stubLeaderboardRow(700),
    ];
    dependencies.execute.mockResolvedValue({ rows });

    const page = await getSeasonLeaderboardPage({
      seasonId: 1,
      userId: 700,
      offset: 25,
      limit: 25,
    });

    expect(page.rows.map((row) => row.place)).toEqual(places);
    expect(page.rows.some((row) => row.userId === 700)).toBe(false);
    expect(page.myPlace).toBe(700);
    expect(page.myRow?.place).toBe(700);
  });

  it("includes the caller once in rows and mirrors them in myRow when they sit inside the slice", async () => {
    const places = Array.from({ length: 25 }, (_, i) => i + 26); // places 26..50
    const rows = places.map((place) => stubLeaderboardRow(place));
    dependencies.execute.mockResolvedValue({ rows });

    const page = await getSeasonLeaderboardPage({
      seasonId: 1,
      userId: 30,
      offset: 25,
      limit: 25,
    });

    expect(page.rows).toHaveLength(25);
    expect(page.rows.filter((row) => row.userId === 30)).toHaveLength(1);
    expect(page.myPlace).toBe(30);
    expect(page.myRow?.place).toBe(30);
  });

  it("propagates total from the stubbed row set", async () => {
    const rows = [1, 2, 3].map((place) =>
      stubLeaderboardRow(place, { total: 987 }),
    );
    dependencies.execute.mockResolvedValue({ rows });

    const page = await getSeasonLeaderboardPage({
      seasonId: 1,
      userId: 999,
      offset: 0,
      limit: 25,
    });

    expect(page.total).toBe(987);
  });

  it("returns an empty page when the stub yields no rows", async () => {
    dependencies.execute.mockResolvedValue({ rows: [] });

    const page = await getSeasonLeaderboardPage({
      seasonId: 1,
      userId: 999,
      offset: 0,
      limit: 25,
    });

    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.myPlace).toBeNull();
    expect(page.myRow).toBeNull();
  });

  it("ranks in SQL with row_number() over the exact standings order, a count(*) total, the BETWEEN page predicate, the caller OR-clause, and the outer order by place", async () => {
    dependencies.execute.mockResolvedValue({ rows: [] });

    await getSeasonLeaderboardPage({
      seasonId: 7,
      userId: 1,
      offset: 25,
      limit: 25,
    });

    const text = capturedSqlText();
    expect(text).toContain(
      "row_number() OVER ( ORDER BY s.points DESC, s.days_played DESC, s.hits DESC, s.user_id ASC )",
    );
    expect(text).toContain("INNER JOIN users u ON u.id = s.user_id");
    expect(text).toContain("WHERE s.season_id =");
    expect(text).toContain("count(*) OVER ()");
    // The page predicate: place falls in [offset + 1, offset + limit]. This
    // needle pins the BETWEEN construct itself, not just the surrounding
    // words, so replacing it with e.g. a plain >= / <= pair still fails.
    expect(text).toContain("WHERE r.place BETWEEN + 1 AND + ");
    // ... OR the caller's own row, so callers always see their place even off-page.
    expect(text).toContain("OR r.user_id = ");
    expect(text).toContain("ORDER BY r.place");
  });
});

/**
 * The ordering now lives in four unlinked places: compareStandingsRank
 * (tested but with zero production call sites), the two raw-SQL
 * row_number() blocks in standings.ts (getSeasonBoard and
 * getSeasonLeaderboardPage), and the drizzle orderBy in seasons.ts's
 * endSeason. All of the SQL occurrences must stay in lockstep with the
 * snapshot orderBy or the live leaderboard silently desynchronises from
 * the archived final ranks in competitive_season_final_ranks. This reads
 * both files as source text — the same convention the SQL-shape
 * assertions above use — and compares the four ordering keys and
 * directions structurally, across every row_number() block found, not
 * just the first — otherwise adding a second ranking query to
 * standings.ts would make this check pass vacuously for it.
 */
describe("ordering stays in lockstep between the live board and the season snapshot", () => {
  function snakeToCamel(s: string): string {
    return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  function sqlOrderKeysAll(src: string): Array<Array<{ column: string; dir: string }>> {
    const matches = [
      ...src.matchAll(
        /ORDER BY s\.(\w+) (DESC|ASC), s\.(\w+) (DESC|ASC), s\.(\w+) (DESC|ASC), s\.(\w+) (DESC|ASC)/g,
      ),
    ];
    if (matches.length === 0) {
      throw new Error("standings.ts row_number() ORDER BY clause not found");
    }
    return matches.map((match) => {
      const [, c1, d1, c2, d2, c3, d3, c4, d4] = match as unknown as string[];
      return [
        { column: snakeToCamel(c1), dir: d1.toLowerCase() },
        { column: snakeToCamel(c2), dir: d2.toLowerCase() },
        { column: snakeToCamel(c3), dir: d3.toLowerCase() },
        { column: snakeToCamel(c4), dir: d4.toLowerCase() },
      ];
    });
  }

  function drizzleOrderKeys(src: string): Array<{ column: string; dir: string }> {
    const block = src.match(
      /\.orderBy\(\s*((?:(?:desc|asc)\(competitiveStandings\.\w+\),?\s*)+)\)/,
    );
    if (!block) throw new Error("seasons.ts competitiveStandings orderBy not found");
    const pairs = [...block[1].matchAll(/(desc|asc)\(competitiveStandings\.(\w+)\)/g)];
    return pairs.map(([, dir, column]) => ({ column, dir }));
  }

  it("the four ordering keys and directions match between every row_number() block in standings.ts's SQL and seasons.ts's endSeason orderBy", () => {
    const seasonsKeys = drizzleOrderKeys(seasonsSrc);
    const sqlBlocks = sqlOrderKeysAll(standingsSrc);

    // Pin the block count too: if this regresses to 1, the loop below
    // would silently stop covering getSeasonLeaderboardPage's query.
    expect(sqlBlocks.length).toBe(2);
    for (const keys of sqlBlocks) {
      expect(keys).toEqual(seasonsKeys);
    }
  });
});
