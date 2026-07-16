import { createHash, randomBytes, randomUUID } from "node:crypto";
import { signAccessToken } from "@/lib/session-token";

const REFRESH_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
const REFRESH_ABSOLUTE_MS = 180 * 24 * 60 * 60 * 1000;

export type SessionRecord = Readonly<{
  id: string;
  userId: number;
  telegramId: string;
  refreshTokenHash: string;
  familyId: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  userAgentHash: string | null;
}>;

export interface SessionRepository {
  insert(row: SessionRecord): Promise<void>;
  findByRefreshHash(hash: string): Promise<SessionRecord | null>;
  replace(oldId: string, next: SessionRecord, now: Date): Promise<boolean>;
  revoke(id: string, now: Date): Promise<void>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function createSessionManager(repo: SessionRepository, options: { sessionSecret: string }) {
  const issue = (row: SessionRecord, refreshToken: string, now: Date) => ({
    status: "ok" as const,
    accessToken: signAccessToken({
      sessionId: row.id,
      userId: row.userId,
      telegramId: row.telegramId,
    }, options.sessionSecret, now),
    refreshToken,
    refreshExpiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
  });

  return {
    async create(userId: number, telegramId: string, userAgent: string | null, now = new Date()) {
      const refreshToken = randomBytes(32).toString("base64url");
      const row: SessionRecord = {
        id: randomUUID(),
        userId,
        telegramId,
        refreshTokenHash: hash(refreshToken),
        familyId: randomUUID(),
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_IDLE_MS),
        absoluteExpiresAt: new Date(now.getTime() + REFRESH_ABSOLUTE_MS),
        revokedAt: null,
        replacedBySessionId: null,
        userAgentHash: userAgent ? hash(userAgent) : null,
      };
      await repo.insert(row);
      return issue(row, refreshToken, now);
    },

    async rotate(refreshToken: string, now = new Date()) {
      const old = await repo.findByRefreshHash(hash(refreshToken));
      if (!old) return { status: "invalid" as const };
      if (old.revokedAt) {
        await repo.revokeFamily(old.familyId, now);
        return { status: "replayed" as const };
      }
      if (old.expiresAt <= now || old.absoluteExpiresAt <= now) {
        await repo.revoke(old.id, now);
        return { status: "expired" as const };
      }
      const nextToken = randomBytes(32).toString("base64url");
      const next: SessionRecord = {
        ...old,
        id: randomUUID(),
        refreshTokenHash: hash(nextToken),
        createdAt: now,
        lastUsedAt: now,
        expiresAt: minDate(new Date(now.getTime() + REFRESH_IDLE_MS), old.absoluteExpiresAt),
        revokedAt: null,
        replacedBySessionId: null,
      };
      const replaced = await repo.replace(old.id, next, now);
      if (!replaced) {
        await repo.revokeFamily(old.familyId, now);
        return { status: "replayed" as const };
      }
      return issue(next, nextToken, now);
    },

    async revoke(refreshToken: string, now = new Date()) {
      const row = await repo.findByRefreshHash(hash(refreshToken));
      if (row) await repo.revoke(row.id, now);
    },
  };
}
