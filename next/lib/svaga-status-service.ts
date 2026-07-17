import { eq } from "drizzle-orm";
import { db, users } from "@/db/schema";
import { getSubscriberStatus, type SvagaCheckResult } from "@/lib/svaga";

const CACHE_TTL_MS = 60 * 60 * 1000;

export type ResolvedSvagaStatus = Readonly<{
  isSubscriber: boolean | null;
  source: "fresh" | "cache" | "stale_cache" | "unknown";
  checkedAt: Date | null;
  error?: string;
}>;

export type UserSvagaCache = Readonly<{
  isSubscriber: boolean | null;
  lastSyncedAt: Date | null;
  lastSyncAttemptAt: Date | null;
  lastSyncError: string | null;
}>;

export interface SvagaStatusRepository {
  getByTelegramId(telegramId: number): Promise<UserSvagaCache | null>;
  ensureUser(telegramId: number): Promise<void>;
  saveSuccess(telegramId: number, isSubscriber: boolean, checkedAt: Date): Promise<void>;
  saveFailure(telegramId: number, error: string, attemptedAt: Date): Promise<void>;
}

export function createSvagaStatusService(
  repository: SvagaStatusRepository,
  fetchStatus: (telegramId: number) => Promise<SvagaCheckResult> = getSubscriberStatus,
) {
  return {
    async resolve(telegramId: number, now = new Date()): Promise<ResolvedSvagaStatus> {
      await repository.ensureUser(telegramId);
      const cached = await repository.getByTelegramId(telegramId);
      const hasConfirmedValue = cached?.isSubscriber !== null && cached?.isSubscriber !== undefined
        && cached.lastSyncedAt !== null;

      if (
        hasConfirmedValue
        && cached.lastSyncedAt
        && now.getTime() - cached.lastSyncedAt.getTime() < CACHE_TTL_MS
      ) {
        return {
          isSubscriber: cached.isSubscriber,
          source: "cache",
          checkedAt: cached.lastSyncedAt,
        };
      }

      const upstream = await fetchStatus(telegramId);
      if (upstream.status === "ok") {
        await repository.saveSuccess(telegramId, upstream.isSubscriber, upstream.checkedAt);
        return {
          isSubscriber: upstream.isSubscriber,
          source: "fresh",
          checkedAt: upstream.checkedAt,
        };
      }

      await repository.saveFailure(telegramId, upstream.reason, now);

      if (hasConfirmedValue && cached.lastSyncedAt) {
        return {
          isSubscriber: cached.isSubscriber,
          source: "stale_cache",
          checkedAt: cached.lastSyncedAt,
          error: upstream.reason,
        };
      }

      return {
        isSubscriber: null,
        source: "unknown",
        checkedAt: null,
        error: upstream.reason,
      };
    },
  };
}

export const userSvagaRepository: SvagaStatusRepository = {
  async getByTelegramId(telegramId) {
    const [row] = await db
      .select({
        isSubscriber: users.isSubscriber,
        lastSyncedAt: users.lastSyncedAt,
        lastSyncAttemptAt: users.lastSyncAttemptAt,
        lastSyncError: users.lastSyncError,
      })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);
    return row ?? null;
  },

  async ensureUser(telegramId) {
    const now = new Date();
    await db
      .insert(users)
      .values({
        telegramId,
        telegramUsername: null,
        displayName: `user${telegramId}`,
        role: "player",
        isSubscriber: null,
        lastSyncedAt: null,
        lastSyncAttemptAt: null,
        lastSyncError: null,
        linkedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: users.telegramId });
  },

  async saveSuccess(telegramId, isSubscriber, checkedAt) {
    await db
      .update(users)
      .set({
        isSubscriber,
        lastSyncedAt: checkedAt,
        lastSyncAttemptAt: checkedAt,
        lastSyncError: null,
        updatedAt: checkedAt,
      })
      .where(eq(users.telegramId, telegramId));
  },

  async saveFailure(telegramId, error, attemptedAt) {
    await db
      .update(users)
      .set({
        lastSyncAttemptAt: attemptedAt,
        lastSyncError: error,
        updatedAt: attemptedAt,
      })
      .where(eq(users.telegramId, telegramId));
  },
};

export const svagaStatusService = createSvagaStatusService(userSvagaRepository);
