// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const domain = readFileSync(resolve(import.meta.dirname, "../../lib/admin/custom-daily.ts"), "utf8");
const generation = readFileSync(resolve(import.meta.dirname, "../../lib/daily-generate.ts"), "utf8");
const participation = readFileSync(resolve(import.meta.dirname, "../../lib/daily-integrity.ts"), "utf8");
const reentry = readFileSync(resolve(import.meta.dirname, "../../lib/daily-reentry.ts"), "utf8");

describe("custom Daily persistence invariants", () => {
  it("excludes only regular history and keeps regular reentry consumption", () => {
    expect(generation).toContain('eq(dailyScrandles.source, "regular")');
    expect(generation).toContain('source: "regular" as const');
    expect(generation).toMatch(/tx\s*\.update\(dailyReentryGrants\)/);
    expect(domain).toContain('source: "custom" as const');
    expect(domain).not.toContain("dailyReentryGrants");
    expect(reentry.match(/eq\(dailyScrandles\.source, "regular"\)/g)).toHaveLength(2);
  });

  it("serializes cancellation against concurrent participation without serializing players", () => {
    expect(domain.match(/pg_advisory_xact_lock\(hashtext/g)).toHaveLength(2);
    expect(participation.match(/pg_advisory_xact_lock_shared\(hashtext/g)).toHaveLength(2);
    expect(domain).toContain("scrandleVotes");
    expect(domain).toContain("dailyUserResults");
    expect(participation).toContain(".onConflictDoNothing({");
    expect(participation).toContain("Conflicting Daily vote could not be reloaded");
  });

  it("maps a publish unique-index race to a friendly date conflict", () => {
    expect(domain).toContain("if (isUniqueViolation(error))");
    expect(domain).toContain('code: "date_conflict"');
  });
});
