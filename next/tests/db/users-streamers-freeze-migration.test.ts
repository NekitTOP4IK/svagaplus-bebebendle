import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("0015 users streamers freeze migration", () => {
  it("persists a uniquely derivable legacy freeze gap and resets ambiguous charges", () => {
    const migration = readFileSync(resolve(import.meta.dirname, "../../db/migrations/0015_users_streamers_freeze.sql"), "utf8");

    expect(migration).toContain('"competitive_streak_freeze_date" = "legacy_gap"."freeze_date"');
    expect(migration).toContain('"competitive_streak_freeze_season_id" = CASE WHEN "legacy_gap"."freeze_date" IS NULL THEN NULL');
    expect(migration).toContain('COUNT(*) OVER (PARTITION BY "freeze"."user_id", "freeze"."season_id")');
  });
});
