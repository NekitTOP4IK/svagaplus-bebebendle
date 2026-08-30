// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  checkRateLimit: vi.fn(),
  headers: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  browse: vi.fn(),
  writeAuditLog: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: dependencies.headers }));
vi.mock("@/app/api/middleware/rateLimit", () => ({ checkRateLimit: dependencies.checkRateLimit }));
vi.mock("@/lib/auth-server", () => ({ getCurrentUser: dependencies.getCurrentUser }));
vi.mock("@/lib/moderation-audit", () => ({ writeAuditLog: dependencies.writeAuditLog }));
vi.mock("@/lib/daily-rotation-notify", () => ({ notifyAuthorsDailyRotation: dependencies.notify }));
vi.mock("@/lib/admin/custom-daily", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/admin/custom-daily")>();
  return {
    ...original,
    createCustomDailyEvent: dependencies.create,
    updateCustomDailyEvent: dependencies.update,
    publishCustomDailyEvent: dependencies.publish,
    cancelCustomDailyEvent: dependencies.cancel,
    listApprovedCustomDailyScrans: dependencies.browse,
  };
});

import {
  browseApprovedCustomDailyScrans,
  cancelAdminCustomDailyEvent,
  createAdminCustomDailyEvent,
  publishAdminCustomDailyEvent,
  updateAdminCustomDailyEvent,
} from "@/app/actions/admin-custom-daily";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";

const input = {
  name: "Битва бургеров",
  targetDate: "2026-09-12",
  notifyAuthors: true,
  showEventBadge: true,
  showOnHome: true,
  badgeStyle: "neon" as const,
  scranIds: [1, 2],
};

const event = {
  id: 7,
  ...input,
  status: "published" as const,
  entryCount: 2,
  createdByUserId: 1,
  entries: [
    { id: 1, position: 1, name: "A", imageUrl: "/a", price: 1 },
    { id: 2, position: 2, name: "B", imageUrl: "/b", price: 2 },
  ],
  createdAt: new Date("2026-08-29T00:00:00Z"),
  updatedAt: new Date("2026-08-29T00:00:00Z"),
  publishedAt: new Date("2026-08-29T00:00:00Z"),
};

describe("admin custom Daily actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dependencies.headers.mockResolvedValue(new Headers({ "x-real-ip": "127.0.0.1" }));
    dependencies.checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects mutations from a moderator before touching the domain", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 4, role: "moderator" });
    await expect(createAdminCustomDailyEvent(input)).resolves.toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(dependencies.create).not.toHaveBeenCalled();
  });

  it("allows staff to browse a validated paginated dish catalog", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 4, role: "moderator" });
    dependencies.browse.mockResolvedValue({
      items: [{ id: 2, name: "Борщ", imageUrl: "/b", price: 300 }],
      page: 2,
      pageSize: 12,
      total: 13,
      totalPages: 2,
    });
    await expect(browseApprovedCustomDailyScrans({ query: " борщ ", page: 2, sort: "name" })).resolves.toEqual({
      ok: true,
      data: {
        items: [{ id: 2, name: "Борщ", imageUrl: "/b", price: 300 }],
        page: 2,
        pageSize: 12,
        total: 13,
        totalPages: 2,
      },
    });
    expect(dependencies.browse).toHaveBeenCalledWith({ query: "борщ", page: 2, sort: "name" });
  });

  it("rejects invalid dish catalog input before querying the domain", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    await expect(browseApprovedCustomDailyScrans({ query: "", page: -1, sort: "newest" })).resolves.toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(dependencies.browse).not.toHaveBeenCalled();
  });

  it("rate limits admin mutations before writing", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    dependencies.checkRateLimit.mockResolvedValue({ allowed: false });
    await expect(createAdminCustomDailyEvent(input)).resolves.toMatchObject({
      ok: false,
      code: "rate_limited",
    });
    expect(dependencies.create).not.toHaveBeenCalled();
  });

  it("writes one operation-level audit record after create", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    dependencies.create.mockResolvedValue({ ok: true, data: { ...event, status: "draft" } });
    await expect(createAdminCustomDailyEvent(input)).resolves.toMatchObject({ ok: true });
    expect(dependencies.create).toHaveBeenCalledWith(expect.objectContaining({
      showEventBadge: true,
      showOnHome: true,
      badgeStyle: "neon",
    }), 1);
    expect(dependencies.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(dependencies.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 1,
      action: AUDIT_ACTIONS.DAILY_CUSTOM_CREATE,
    }));
  });

  it("preserves expected create and update conflicts without auditing", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    dependencies.create.mockResolvedValue({ ok: false, code: "date_conflict", message: "conflict" });
    dependencies.update.mockResolvedValue({ ok: false, code: "invalid_status", message: "published" });
    await expect(createAdminCustomDailyEvent(input)).resolves.toEqual({
      ok: false, code: "date_conflict", message: "conflict",
    });
    await expect(updateAdminCustomDailyEvent({ id: 7, ...input })).resolves.toEqual({
      ok: false, code: "invalid_status", message: "published",
    });
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });

  it("preserves invalid scran and participation guards", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    dependencies.publish.mockResolvedValue({ ok: false, code: "invalid_scrans", message: "invalid" });
    dependencies.cancel.mockResolvedValue({ ok: false, code: "participation_exists", message: "played" });
    await expect(publishAdminCustomDailyEvent(7)).resolves.toEqual({
      ok: false, code: "invalid_scrans", message: "invalid",
    });
    await expect(cancelAdminCustomDailyEvent(7)).resolves.toEqual({
      ok: false, code: "participation_exists", message: "played",
    });
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });

  it("notifies authors after publish and keeps the publication on notifier failure", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    dependencies.publish.mockResolvedValue({
      ok: true,
      data: {
        event,
        notificationScrans: [{ id: 1, name: "A", telegramId: "10" }],
      },
    });
    dependencies.notify.mockRejectedValue(new Error("Telegram unavailable"));
    await expect(publishAdminCustomDailyEvent(7)).resolves.toEqual({
      ok: true,
      data: { event, notify: null },
    });
    expect(dependencies.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(dependencies.notify).toHaveBeenCalledWith("2026-09-12", [
      { id: 1, name: "A", telegramId: "10" },
    ]);
  });

  it("reports a committed publish as successful when audit storage fails", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ id: 1, role: "admin" });
    dependencies.publish.mockResolvedValue({
      ok: true,
      data: {
        event,
        notificationScrans: [{ id: 1, name: "A", telegramId: "10" }],
      },
    });
    dependencies.writeAuditLog.mockRejectedValue(new Error("Audit unavailable"));
    dependencies.notify.mockResolvedValue({ sent: 1, skipped: 0, disabled: false });

    await expect(publishAdminCustomDailyEvent(7)).resolves.toEqual({
      ok: true,
      data: {
        event,
        notify: { sent: 1, skipped: 0, disabled: false },
      },
    });
    expect(dependencies.notify).toHaveBeenCalledTimes(1);
  });
});
