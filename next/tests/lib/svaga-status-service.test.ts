// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createSvagaStatusService,
  type SvagaStatusRepository,
  type UserSvagaCache,
} from "@/lib/svaga-status-service";
import type { SvagaCheckResult } from "@/lib/svaga";

class MemoryRepo implements SvagaStatusRepository {
  rows = new Map<number, UserSvagaCache>();
  saveSuccessCalls: Array<{ telegramId: number; isSubscriber: boolean; checkedAt: Date }> = [];
  saveFailureCalls: Array<{ telegramId: number; error: string }> = [];

  async getByTelegramId(telegramId: number) {
    return this.rows.get(telegramId) ?? null;
  }

  async ensureUser(telegramId: number) {
    if (!this.rows.has(telegramId)) {
      this.rows.set(telegramId, {
        isSubscriber: null,
        lastSyncedAt: null,
        lastSyncAttemptAt: null,
        lastSyncError: null,
      });
    }
  }

  async saveSuccess(telegramId: number, isSubscriber: boolean, checkedAt: Date) {
    this.saveSuccessCalls.push({ telegramId, isSubscriber, checkedAt });
    this.rows.set(telegramId, {
      isSubscriber,
      lastSyncedAt: checkedAt,
      lastSyncAttemptAt: checkedAt,
      lastSyncError: null,
    });
  }

  async saveFailure(telegramId: number, error: string, attemptedAt: Date) {
    this.saveFailureCalls.push({ telegramId, error });
    const prev = this.rows.get(telegramId) ?? {
      isSubscriber: null,
      lastSyncedAt: null,
      lastSyncAttemptAt: null,
      lastSyncError: null,
    };
    this.rows.set(telegramId, {
      ...prev,
      lastSyncAttemptAt: attemptedAt,
      lastSyncError: error,
    });
  }
}

describe("svaga status service", () => {
  it("returns cache when younger than one hour without calling upstream", async () => {
    const repo = new MemoryRepo();
    const cachedAt = new Date("2026-07-16T12:00:00Z");
    repo.rows.set(1, {
      isSubscriber: true,
      lastSyncedAt: cachedAt,
      lastSyncAttemptAt: cachedAt,
      lastSyncError: null,
    });
    const fetchStatus = vi.fn<[], Promise<SvagaCheckResult>>();
    const service = createSvagaStatusService(repo, fetchStatus);

    const result = await service.resolve(1, new Date("2026-07-16T12:30:00Z"));
    expect(result).toEqual({ isSubscriber: true, source: "cache", checkedAt: cachedAt });
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("returns fresh after stale cache and saves success", async () => {
    const repo = new MemoryRepo();
    const cachedAt = new Date("2026-07-16T10:00:00Z");
    repo.rows.set(1, {
      isSubscriber: true,
      lastSyncedAt: cachedAt,
      lastSyncAttemptAt: cachedAt,
      lastSyncError: null,
    });
    const upstreamAt = new Date("2026-07-16T12:00:00Z");
    const fetchStatus = vi.fn().mockResolvedValue({
      status: "ok",
      isSubscriber: false,
      checkedAt: upstreamAt,
    } satisfies SvagaCheckResult);
    const service = createSvagaStatusService(repo, fetchStatus);

    const result = await service.resolve(1, new Date("2026-07-16T12:00:00Z"));
    expect(result).toEqual({ isSubscriber: false, source: "fresh", checkedAt: upstreamAt });
    expect(repo.saveSuccessCalls).toHaveLength(1);
  });

  it("preserves prior value on stale cache + timeout", async () => {
    const repo = new MemoryRepo();
    const cachedAt = new Date("2026-07-16T10:00:00Z");
    repo.rows.set(1, {
      isSubscriber: true,
      lastSyncedAt: cachedAt,
      lastSyncAttemptAt: cachedAt,
      lastSyncError: null,
    });
    const fetchStatus = vi.fn().mockResolvedValue({
      status: "unavailable",
      reason: "timeout",
    } satisfies SvagaCheckResult);
    const service = createSvagaStatusService(repo, fetchStatus);

    const result = await service.resolve(1, new Date("2026-07-16T12:00:00Z"));
    expect(result).toEqual({
      isSubscriber: true,
      source: "stale_cache",
      checkedAt: cachedAt,
      error: "timeout",
    });
  });

  it("never invents false when there is no cache and upstream times out", async () => {
    const repo = new MemoryRepo();
    const fetchStatus = vi.fn().mockResolvedValue({
      status: "unavailable",
      reason: "timeout",
    } satisfies SvagaCheckResult);
    const service = createSvagaStatusService(repo, fetchStatus);

    const result = await service.resolve(1, new Date("2026-07-16T12:00:00Z"));
    expect(result).toEqual({
      isSubscriber: null,
      source: "unknown",
      checkedAt: null,
      error: "timeout",
    });
  });
});
