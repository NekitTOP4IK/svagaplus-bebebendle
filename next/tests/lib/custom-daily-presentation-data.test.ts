import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dailyDataSource = readFileSync(
  resolve(import.meta.dirname, "../../app/daily/lib/get-daily-data.ts"),
  "utf8",
);

describe("custom Daily presentation data", () => {
  it("exposes badge visibility and style in the Daily payload", () => {
    expect(dailyDataSource).toContain("eventBadgeVisible: eventData[0].showEventBadge");
    expect(dailyDataSource).toContain("eventBadgeStyle: eventData[0].badgeStyle");
  });

  it("only exposes home copy for published events that opt in", () => {
    expect(dailyDataSource).toContain("getTodayCustomDailyHomePresentation");
    expect(dailyDataSource).toContain('eq(dailyCustomEvents.status, "published")');
    expect(dailyDataSource).toContain("eq(dailyCustomEvents.showOnHome, true)");
  });
});
