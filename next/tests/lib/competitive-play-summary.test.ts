import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const play = readFileSync(
  resolve(process.cwd(), "lib/competitive/play.ts"),
  "utf8",
);
const normalizedPlay = play.replace(/\s+/g, " ");

describe("finalizeCompetitive day summary", () => {
  it("carries the summary on the success branch", () => {
    expect(play).toContain("type CompetitiveDaySummary");
    expect(play).toMatch(/summary:\s*CompetitiveDaySummary/);
  });

  it("counts today's players strictly below the player's score", () => {
    expect(play).toContain(
      "count(*) filter (where ${competitiveResults.points} < ${points})::int",
    );
    expect(play).toContain("betterThanPercent");
  });

  it("scopes the percentile to a single contiguous query on the day and the season", () => {
    // A whitespace-normalised match on the full .from(...).where(and(...)) chunk,
    // so this can't be satisfied by the unrelated eq(date) / eq(seasonId) calls
    // elsewhere in this file (getUserResult, the finalize transaction's
    // seasonResultDates query).
    expect(normalizedPlay).toContain(
      ".from(competitiveResults) .where( and( eq(competitiveResults.date, date), eq(competitiveResults.seasonId, seasonId), ), );",
    );
  });

  it("builds the board from the shared bounded season-board query", () => {
    // Pins the actual call site (both arguments), not just the import line:
    // `import { ..., COMPETITIVE_RESULT_BOARD_TOP } from "./constants"` also
    // contains the substring "COMPETITIVE_RESULT_BOARD_TOP", so a plain
    // `toContain("COMPETITIVE_RESULT_BOARD_TOP")` is satisfied by the import
    // alone and never reaches the call below — changing `topN:
    // COMPETITIVE_RESULT_BOARD_TOP` to `topN: 50` would leave it green.
    expect(normalizedPlay).toContain(
      "getSeasonBoard({ seasonId, userId, topN: COMPETITIVE_RESULT_BOARD_TOP, windowRadius: 1, });",
    );
    expect(play).not.toContain("getSeasonRanking");
    expect(play).not.toContain("buildDayResultBoard");
  });
});
