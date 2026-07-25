import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DailyPanel default date", () => {
  it("uses the shared MSK calendar instead of the browser UTC date", async () => {
    const source = await readFile("components/admin/daily-panel.tsx", "utf8");

    expect(source).toContain('import { todayMskDate } from "@/lib/daily-timezone";');
    expect(source).toContain("useState(() => todayMskDate())");
    expect(source).not.toContain("new Date().toISOString().slice(0, 10)");
  });
});
