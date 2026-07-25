// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  requireRole: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ requireRole: dependencies.requireRole }));
vi.mock("@/lib/moderation-audit", () => ({ writeAuditLog: dependencies.writeAuditLog }));
vi.mock("@/db/schema", () => ({
  db: { select: dependencies.select, update: dependencies.update, insert: dependencies.insert, execute: dependencies.execute, transaction: dependencies.transaction },
  users: {
    id: "users.id", telegramId: "users.telegram_id", telegramUsername: "users.telegram_username",
    telegramPhotoUrl: "users.telegram_photo_url", displayName: "users.display_name", role: "users.role", isSubscriber: "users.is_subscriber",
    lastSyncedAt: "users.last_synced_at", lastSyncAttemptAt: "users.last_sync_attempt_at",
    lastSyncError: "users.last_sync_error", svagaTelegramUserId: "users.svaga_telegram_user_id",
    svagaUserId: "users.svaga_user_id", linkedAt: "users.linked_at", createdAt: "users.created_at", updatedAt: "users.updated_at",
    competitiveStreakFreezeSeasonId: "users.competitive_streak_freeze_season_id",
    competitiveStreakFreezeUsedAt: "users.competitive_streak_freeze_used_at",
    competitiveStreakFreezeDate: "users.competitive_streak_freeze_date",
  },
  userSessions: { userId: "sessions.user_id" },
  dailyUserResults: { userId: "daily_results.user_id" },
  competitiveResults: { userId: "competitive_results.user_id" },
  moderationAuditLog: { actorUserId: "audit.actor_user_id", action: "audit.action", details: "audit.details" },
}));

import { getUserDiagnostics, getUsersPage, updateUser } from "@/app/admin/actions";

function selectRows(rows: unknown[]) {
  const chain = { from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), offset: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.offset.mockResolvedValue(rows);
  chain.limit.mockReturnValue(chain);
  Object.assign(chain, { then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) });
  return chain;
}

describe("admin user actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    dependencies.requireRole.mockResolvedValue({ id: 7, role: "admin" });
    dependencies.transaction.mockImplementation(async (callback) => callback({
      select: dependencies.select,
      update: dependencies.update,
      insert: dependencies.insert,
      execute: dependencies.execute,
    }));
  });

  it("rejects an invalid role before updating", async () => {
    await expect(updateUser(5, { role: "owner" } as unknown as Parameters<typeof updateUser>[1])).resolves.toMatchObject({
      success: false, message: "Invalid role",
    });
    expect(dependencies.update).not.toHaveBeenCalled();
  });

  it("rejects demoting the final admin", async () => {
    const target = selectRows([{ id: 5, role: "admin" }]);
    const admins = selectRows([{ count: 1 }]);
    dependencies.select.mockReturnValueOnce(target).mockReturnValueOnce(admins);

    await expect(updateUser(5, { role: "player" })).resolves.toMatchObject({
      success: false, message: "Cannot demote the final admin",
    });
    expect(dependencies.update).not.toHaveBeenCalled();
  });

  it("assigns streamer and writes a field-level audit record in the transaction", async () => {
    const target = selectRows([{ id: 5, role: "player" }]);
    dependencies.select.mockReturnValueOnce(target);
    const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockReturnValue(updateChain);
    updateChain.returning.mockResolvedValue([{ id: 5 }]);
    dependencies.update.mockReturnValue(updateChain);
    const insertChain = { values: vi.fn().mockResolvedValue(undefined) };
    dependencies.insert.mockReturnValue(insertChain);

    await expect(updateUser(5, { role: "streamer" })).resolves.toEqual({ success: true, data: null });
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ role: "streamer", updatedAt: expect.any(Date) }));
    expect(dependencies.transaction).toHaveBeenCalledOnce();
    expect(insertChain.values).toHaveBeenCalledWith({
      actorUserId: 7,
      action: "users.update",
      details: JSON.stringify({
        userId: 5,
        changed: ["role"],
        changes: { role: { old: "player", new: "streamer" } },
      }),
    });
  });

  it("serializes concurrent admin demotions by locking every admin in one transaction", async () => {
    const target = selectRows([{ id: 5, role: "admin" }]);
    const admins = selectRows([{ count: 2 }]);
    dependencies.select.mockReturnValueOnce(target).mockReturnValueOnce(admins);
    dependencies.execute.mockResolvedValue({ rows: [{ id: 5 }, { id: 6 }] });
    const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 5 }]) };
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockReturnValue(updateChain);
    dependencies.update.mockReturnValue(updateChain);
    dependencies.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

    await expect(updateUser(5, { role: "player" })).resolves.toEqual({ success: true, data: null });
    expect(dependencies.transaction).toHaveBeenCalledOnce();
    expect(dependencies.execute).toHaveBeenCalledOnce();
  });

  it("rejects a patch for a user deleted before the update and does not audit it", async () => {
    dependencies.select.mockReturnValueOnce(selectRows([]));

    await expect(updateUser(999, { displayName: "Gone" })).resolves.toMatchObject({ success: false, message: "User not found" });
    expect(dependencies.insert).not.toHaveBeenCalled();
  });

  it("fails the edit when the transactional audit insert fails", async () => {
    const target = selectRows([{ id: 5, role: "player" }]);
    dependencies.select.mockReturnValueOnce(target);
    const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn().mockResolvedValue([{ id: 5 }]) };
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockReturnValue(updateChain);
    dependencies.update.mockReturnValue(updateChain);
    dependencies.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit unavailable")) });

    await expect(updateUser(5, { role: "streamer" })).resolves.toMatchObject({ success: false, message: "Failed to update user" });
    expect(dependencies.transaction).toHaveBeenCalledOnce();
  });

  it("applies search, pagination, and a bounded page size", async () => {
    const rows = selectRows([]);
    const total = selectRows([{ count: 0 }]);
    dependencies.select.mockReturnValueOnce(rows).mockReturnValueOnce(total);

    await expect(getUsersPage("alice", 2, 500)).resolves.toEqual({ success: true, data: { rows: [], total: 0 } });
    expect(rows.where).toHaveBeenCalledOnce();
    expect(rows.limit).toHaveBeenCalledWith(100);
    expect(rows.offset).toHaveBeenCalledWith(100);
    expect(total.where).toHaveBeenCalledOnce();
  });

  it("selects required list fields and read-only diagnostics without session secrets", async () => {
    const rows = selectRows([]);
    const total = selectRows([{ count: 0 }]);
    dependencies.select.mockReturnValueOnce(rows).mockReturnValueOnce(total);

    await getUsersPage();
    expect(dependencies.select.mock.calls.map(([selection]) => selection)).toContainEqual(expect.objectContaining({
      isSubscriber: "users.is_subscriber",
      createdAt: "users.created_at",
      updatedAt: "users.updated_at",
    }));

    const user = selectRows([{
      id: 5, telegramId: 123, telegramUsername: null, telegramPhotoUrl: null, displayName: null,
      role: "player", isSubscriber: null, lastSyncedAt: null, lastSyncAttemptAt: null,
      lastSyncError: null, svagaTelegramUserId: null, svagaUserId: null, linkedAt: null,
      competitiveStreakFreezeSeasonId: null, competitiveStreakFreezeUsedAt: null,
      competitiveStreakFreezeDate: null, createdAt: new Date(), updatedAt: new Date(),
    }]);
    const count = selectRows([{ count: 0 }]);
    dependencies.select.mockReturnValueOnce(user).mockReturnValueOnce(count).mockReturnValueOnce(count).mockReturnValueOnce(count);

    await getUserDiagnostics(5);
    expect(dependencies.select.mock.calls.map(([selection]) => selection)).toContainEqual(expect.objectContaining({
      telegramPhotoUrl: "users.telegram_photo_url",
      svagaTelegramUserId: "users.svaga_telegram_user_id",
      svagaUserId: "users.svaga_user_id",
      linkedAt: "users.linked_at",
      updatedAt: "users.updated_at",
      competitiveStreakFreezeSeasonId: "users.competitive_streak_freeze_season_id",
      competitiveStreakFreezeDate: "users.competitive_streak_freeze_date",
    }));
  });
});
