// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDailyPreview: vi.fn(),
  generateDailyForDate: vi.fn(),
  select: vi.fn(),
  writeAuditLog: vi.fn(),
  isDailyRotationNotifyEnabled: vi.fn(),
  isDailyGenerationEnabled: vi.fn(),
  getDailyDisabledReason: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getCurrentUser: dependencies.getCurrentUser }));
vi.mock("@/lib/daily-generate", () => ({
  getDailyPreview: dependencies.getDailyPreview,
  generateDailyForDate: dependencies.generateDailyForDate,
  todayUtcDate: () => "2026-07-25",
}));
vi.mock("@/lib/moderation-audit", () => ({ writeAuditLog: dependencies.writeAuditLog }));
vi.mock("@/db/schema", () => ({ db: { select: dependencies.select }, dailyScrandles: { date: "date" } }));
vi.mock("@/lib/app-settings", () => ({
  isDailyRotationNotifyEnabled: dependencies.isDailyRotationNotifyEnabled,
  isDailyGenerationEnabled: dependencies.isDailyGenerationEnabled,
  getDailyDisabledReason: dependencies.getDailyDisabledReason,
}));

import { getAdminDailyView, generateAdminDaily } from "@/app/actions/admin-daily";

describe("admin daily actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects daily generation for a moderator", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 4, role: "moderator" });

    await expect(generateAdminDaily({ date: "2026-07-25" })).resolves.toEqual({
      ok: false, code: "forbidden", message: "Administrator access is required.",
    });
    expect(dependencies.generateDailyForDate).not.toHaveBeenCalled();
  });

  it("rejects malformed daily preview dates before querying the database", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 4, role: "admin" });

    await expect(getAdminDailyView({ date: "tomorrow" })).resolves.toEqual({
      ok: false, code: "invalid_input", message: "Invalid date.",
    });
    expect(dependencies.getDailyPreview).not.toHaveBeenCalled();
  });
});
