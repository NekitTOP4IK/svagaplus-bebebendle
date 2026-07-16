import { and, eq, isNull } from "drizzle-orm";
import { db, userSessions, users } from "@/db/schema";
import type { SessionRecord, SessionRepository } from "@/lib/session-manager";

type SessionRow = typeof userSessions.$inferSelect;

function toRecord(row: SessionRow, telegramId: number): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    telegramId: String(telegramId),
    refreshTokenHash: row.refreshTokenHash,
    familyId: row.familyId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
    replacedBySessionId: row.replacedBySessionId,
    userAgentHash: row.userAgentHash,
  };
}

function insertValues(row: SessionRecord): typeof userSessions.$inferInsert {
  return {
    id: row.id,
    userId: row.userId,
    refreshTokenHash: row.refreshTokenHash,
    familyId: row.familyId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
    replacedBySessionId: row.replacedBySessionId,
    userAgentHash: row.userAgentHash,
  };
}

export const sessionRepository: SessionRepository = {
  async insert(row) {
    await db.insert(userSessions).values(insertValues(row));
  },

  async findByRefreshHash(refreshTokenHash) {
    const [result] = await db
      .select({ session: userSessions, telegramId: users.telegramId })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return result ? toRecord(result.session, result.telegramId) : null;
  },

  async replace(oldId, next, now) {
    return db.transaction(async (tx) => {
      const replaced = await tx.update(userSessions)
        .set({ revokedAt: now, replacedBySessionId: next.id, lastUsedAt: now })
        .where(and(eq(userSessions.id, oldId), isNull(userSessions.revokedAt)))
        .returning({ id: userSessions.id });
      if (replaced.length !== 1) return false;
      await tx.insert(userSessions).values(insertValues(next));
      return true;
    });
  },

  async revoke(id, now) {
    await db.update(userSessions)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(eq(userSessions.id, id), isNull(userSessions.revokedAt)));
  },

  async revokeFamily(familyId, now) {
    await db.update(userSessions)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(eq(userSessions.familyId, familyId), isNull(userSessions.revokedAt)));
  },
};
