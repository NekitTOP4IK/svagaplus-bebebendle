import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../db/migrations/0018_add_custom_daily_presentation.sql"),
  "utf8",
);

describe("0018 custom Daily presentation migration", () => {
  it("backfills safe presentation defaults", () => {
    expect(migration).toContain('"show_event_badge" boolean DEFAULT true NOT NULL');
    expect(migration).toContain('"show_on_home" boolean DEFAULT false NOT NULL');
    expect(migration).toContain('"badge_style" text DEFAULT \'violet\' NOT NULL');
  });

  it("restricts badge styles to supported renderers", () => {
    expect(migration).toContain('CHECK ("badge_style" IN (\'violet\', \'gold\', \'neon\', \'rainbow\'))');
  });
});
