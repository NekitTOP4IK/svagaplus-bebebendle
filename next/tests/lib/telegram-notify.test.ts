import { describe, expect, it } from "vitest";
import { buildDailyRotationMessage } from "@/lib/telegram-notify";

describe("buildDailyRotationMessage", () => {
  it("formats a single dish", () => {
    const msg = buildDailyRotationMessage("2026-07-17", ["Борщ"]);
    expect(msg).toContain("«Борщ»");
    expect(msg).toContain("2026-07-17");
    expect(msg).toContain("ротацию");
  });

  it("lists multiple dishes for one author", () => {
    const msg = buildDailyRotationMessage("2026-07-17", ["А", "Б"]);
    expect(msg).toContain("• А");
    expect(msg).toContain("• Б");
    expect(msg).toContain("2026-07-17");
  });
});
