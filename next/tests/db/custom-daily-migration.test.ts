import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../db/migrations/0017_add_custom_daily_events.sql"),
  "utf8",
);

describe("0017 custom daily events migration", () => {
  it("backfills existing Daily rounds as regular", () => {
    expect(migration).toContain('ADD COLUMN "source" text DEFAULT \'regular\' NOT NULL');
    expect(migration).toContain('CHECK ("source" IN (\'regular\', \'custom\'))');
  });

  it("allows only one active event per date", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "daily_custom_events_active_date_uidx"');
    expect(migration).toContain('WHERE "status" <> \'cancelled\'');
  });

  it("protects entry identity, ordering, and position range", () => {
    expect(migration).toContain('PRIMARY KEY ("event_id", "scran_id")');
    expect(migration).toContain('CREATE UNIQUE INDEX "daily_custom_event_entries_event_position_uidx"');
    expect(migration).toContain('CHECK ("position" BETWEEN 1 AND 20)');
  });
});
