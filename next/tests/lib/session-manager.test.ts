// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSessionManager, type SessionRecord, type SessionRepository } from "@/lib/session-manager";

class MemorySessionRepository implements SessionRepository {
  rows = new Map<string, SessionRecord>();
  async insert(row: SessionRecord) { this.rows.set(row.id, row); }
  async findByRefreshHash(hash: string) {
    return [...this.rows.values()].find((row) => row.refreshTokenHash === hash) ?? null;
  }
  async replace(oldId: string, next: SessionRecord, now: Date) {
    const old = this.rows.get(oldId);
    if (!old || old.revokedAt) return false;
    this.rows.set(oldId, { ...old, revokedAt: now, replacedBySessionId: next.id, lastUsedAt: now });
    this.rows.set(next.id, next);
    return true;
  }
  async revoke(id: string, now: Date) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, revokedAt: now });
  }
  async revokeFamily(familyId: string, now: Date) {
    for (const [id, row] of this.rows) {
      if (row.familyId === familyId && !row.revokedAt) this.rows.set(id, { ...row, revokedAt: now });
    }
  }
}

describe("refresh sessions", () => {
  it("rotates refresh tokens and caps the family at 180 days", async () => {
    const repo = new MemorySessionRepository();
    const manager = createSessionManager(repo, { sessionSecret: "s".repeat(32) });
    const start = new Date("2026-01-01T00:00:00Z");
    const first = await manager.create(1, "123", null, start);
    const rotated = await manager.rotate(first.refreshToken, new Date("2026-03-01T00:00:00Z"));
    expect(rotated.status).toBe("ok");
    if (rotated.status !== "ok") throw new Error("expected rotation");
    expect(rotated.refreshExpiresAt.toISOString()).toBe("2026-05-30T00:00:00.000Z");
    expect(rotated.absoluteExpiresAt.toISOString()).toBe("2026-06-30T00:00:00.000Z");
    expect(first.refreshToken).not.toBe(rotated.refreshToken);
  });

  it("revokes the family when a rotated token is replayed", async () => {
    const repo = new MemorySessionRepository();
    const manager = createSessionManager(repo, { sessionSecret: "s".repeat(32) });
    const first = await manager.create(1, "123", null, new Date("2026-01-01T00:00:00Z"));
    const rotated = await manager.rotate(first.refreshToken, new Date("2026-01-02T00:00:00Z"));
    expect(rotated.status).toBe("ok");
    expect((await manager.rotate(first.refreshToken, new Date("2026-01-03T00:00:00Z"))).status).toBe("replayed");
    expect([...repo.rows.values()].every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("rejects idle and absolute expiry and supports logout", async () => {
    const repo = new MemorySessionRepository();
    const manager = createSessionManager(repo, { sessionSecret: "s".repeat(32) });
    const first = await manager.create(1, "123", null, new Date("2026-01-01T00:00:00Z"));
    expect((await manager.rotate(first.refreshToken, new Date("2026-04-02T00:00:00Z"))).status).toBe("expired");
    await manager.revoke(first.refreshToken, new Date("2026-01-02T00:00:00Z"));
    expect((await manager.rotate(first.refreshToken, new Date("2026-01-03T00:00:00Z"))).status).toBe("replayed");
  });
});
