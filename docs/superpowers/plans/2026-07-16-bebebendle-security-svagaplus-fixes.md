# Bebebendle Security and SVAGA+ Integration Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace forgeable authentication, implement access/refresh session rotation, add the authoritative Olesha-scoped SVAGA+ endpoint, preserve unknown subscription states, and ship a truthful user-facing subscription check.

**Architecture:** SVAGA+ owns an authenticated versioned status endpoint scoped by `SVAGA_TARGET_USER_ID`. Bebebendle consumes it through a typed client and a tri-state cache service, while access/refresh authentication is isolated behind token, repository, and session-manager modules. The Telegram bot stores nullable subscription snapshots and never converts an outage into a confirmed non-subscriber result.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle ORM, PostgreSQL, Redis, Vitest, Flask, SQLAlchemy, pytest, Python 3.11, aiogram, asyncpg.

---

## Execution Rules

- Execute SVAGA+ tasks in `/mnt/data/dev/Other projects/SvagaPlus Server` and Bebebendle tasks in `/mnt/data/dev/Other projects/svagaplus-bebebendle`.
- At execution time, use `superpowers:using-git-worktrees` for each repository. Do not implement this cross-repo change in the dirty Bebebendle checkout.
- In SVAGA+, follow `AGENTS.md`: run GitNexus impact analysis before editing registered symbols and `detect_changes` before committing.
- Do not deploy Bebebendle consumers before the SVAGA+ endpoint is live in the matching environment.
- Do not restore the old raw `bebebendle_session` cookie as a compatibility fallback. It is intentionally invalidated.
- Every task ends with a focused commit. Do not mix changes from the two repositories in one commit.

## File Map

### SVAGA+ repository

- Create `backend/routes/bebebendle_internal.py`: protected v1 internal status endpoint.
- Create `backend/tests/test_bebebendle_internal.py`: endpoint contract, scope, and authorization tests.
- Modify `backend/app.py`: register the new blueprint.
- Modify `backend/.env.example`: document the target ID and dedicated secret.

### Bebebendle repository

- Modify `next/db/schema.ts`: session table and nullable subscription/cache fields.
- Create `next/db/migrations/0005_secure_sessions_and_svaga_status.sql`: forward-only schema migration and missing foreign keys.
- Modify `next/db/migrations/meta/_journal.json`: normalize entries and append migration 0005.
- Create `next/lib/session-token.ts`: access-token HMAC signing and verification.
- Create `next/lib/session-manager.ts`: refresh creation, rotation, replay revocation, and expiry policy.
- Create `next/lib/session-repository.ts`: Drizzle adapter for session rows.
- Create `next/lib/session-cookies.ts`: cookie names, durations, and response helpers.
- Create `next/tests/lib/session-token.test.ts`: token tamper/expiry tests.
- Create `next/tests/lib/session-manager.test.ts`: rotation, replay, logout, and 180-day cap tests.
- Modify `next/lib/auth-server.ts`: authenticate through the signed access token and active session row.
- Modify `next/app/api/auth/telegram/route.ts`: issue access and refresh cookies.
- Create `next/app/api/auth/refresh/route.ts`: rotate the refresh token.
- Create `next/app/api/auth/session/route.ts`: inspect and revoke the current session.
- Create `next/lib/api-client.ts`: one retry after single-flight refresh.
- Modify authenticated hooks/components to use `apiFetch` and the new logout route.
- Modify `next/lib/svaga.ts`: v1 client with discriminated unavailable reasons.
- Create `next/lib/svaga-status-service.ts`: fresh/cache/stale/unknown resolution.
- Replace `next/app/api/svaga/link/route.ts` with `next/app/api/svaga/refresh/route.ts`.
- Modify `next/app/api/svaga/status/route.ts`: return local tri-state status and timestamps.
- Modify `next/app/api/internal/svaga/subscription-status/route.ts`: return nullable bot contract.
- Modify `next/tests/lib/svaga.test.ts`: current v1 contract and runtime env behavior.
- Create `next/tests/lib/svaga-status-service.test.ts`: cache/outage semantics.
- Modify `bot/src/main.py`, `bot/src/database.py`, and `bot/tests/test_svaga_helper.py`: nullable snapshots and race-safe cap.
- Modify profile/login/admin presentation and tests.
- Modify `.env.sample`, `README.md`, and `bot/README.md`: exact configuration and rollout documentation.

## Task 1: Add the Authoritative SVAGA+ Internal Endpoint

**Repository:** `/mnt/data/dev/Other projects/SvagaPlus Server`

**Files:**
- Create: `backend/tests/test_bebebendle_internal.py`
- Create: `backend/routes/bebebendle_internal.py`
- Modify: `backend/app.py:340-404`
- Modify: `backend/.env.example`

- [ ] **Step 1: Run impact analysis before editing blueprint registration**

Run:

```bash
cd '/mnt/data/dev/Other projects/SvagaPlus Server'
node .gitnexus/run.cjs impact _register_blueprints --direction upstream --repo svagaplus-server
```

Expected: impact report for `backend/app.py::_register_blueprints`. If risk is HIGH or CRITICAL, report it before editing as required by the repository instructions.

- [ ] **Step 2: Write endpoint tests first**

Create `backend/tests/test_bebebendle_internal.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone


PATH = '/api/internal/bebebendle/subscription-status'
HEADERS = {'X-Internal-Secret': 'bebebendle-test-secret'}


def _post(client, telegram_user_id: object, *, headers: dict[str, str] | None = None):
    return client.post(
        PATH,
        json={'contract_version': 1, 'telegram_user_id': telegram_user_id},
        headers=HEADERS if headers is None else headers,
    )


def test_rejects_missing_or_bad_secret(client, monkeypatch):
    monkeypatch.setenv('BEBEBENDLE_INTERNAL_SECRET', 'bebebendle-test-secret')
    monkeypatch.setenv('SVAGA_TARGET_USER_ID', 'target-user')

    assert _post(client, 100, headers={}).status_code == 401
    assert _post(client, 100, headers={'X-Internal-Secret': 'wrong'}).status_code == 401


def test_requires_server_configuration(client, monkeypatch):
    monkeypatch.delenv('BEBEBENDLE_INTERNAL_SECRET', raising=False)
    monkeypatch.setenv('SVAGA_TARGET_USER_ID', 'target-user')

    response = _post(client, 100)
    assert response.status_code == 503
    assert response.get_json()['error']['code'] == 'integration_not_configured'


def test_rejects_invalid_payload(client, monkeypatch):
    monkeypatch.setenv('BEBEBENDLE_INTERNAL_SECRET', 'bebebendle-test-secret')
    monkeypatch.setenv('SVAGA_TARGET_USER_ID', 'target-user')

    assert _post(client, True).status_code == 400
    assert _post(client, 0).status_code == 400
    assert _post(client, '100').status_code == 400
    response = client.post(
        PATH,
        json={'contract_version': 1, 'telegram_user_id': 100, 'extra': 'drift'},
        headers=HEADERS,
    )
    assert response.status_code == 400


def test_scopes_active_subscription_to_configured_target(app, client, monkeypatch):
    from models import TributeSubscription, User, db

    monkeypatch.setenv('BEBEBENDLE_INTERNAL_SECRET', 'bebebendle-test-secret')
    target = User(username='olesha', email='olesha@example.com')
    other = User(username='other', email='other@example.com')
    target.set_password('password123')
    other.set_password('password123')
    db.session.add_all([target, other])
    db.session.flush()
    monkeypatch.setenv('SVAGA_TARGET_USER_ID', target.id)

    db.session.add_all([
        TributeSubscription(user_id=other.id, telegram_user_id=101, is_active=True, is_banned=False),
        TributeSubscription(user_id=target.id, telegram_user_id=102, is_active=False, is_banned=False),
        TributeSubscription(user_id=target.id, telegram_user_id=103, is_active=True, is_banned=True),
        TributeSubscription(user_id=target.id, telegram_user_id=104, is_active=True, is_banned=False),
    ])
    db.session.commit()

    assert _post(client, 101).get_json()['is_subscriber'] is False
    assert _post(client, 102).get_json()['is_subscriber'] is False
    assert _post(client, 103).get_json()['is_subscriber'] is False
    response = _post(client, 104)
    payload = response.get_json()
    assert response.status_code == 200
    assert payload['contract_version'] == 1
    assert payload['telegram_user_id'] == 104
    assert payload['target_user_id'] == target.id
    assert payload['is_subscriber'] is True
    assert datetime.fromisoformat(payload['checked_at'].replace('Z', '+00:00')).tzinfo == timezone.utc
```

- [ ] **Step 3: Run the endpoint tests and confirm RED**

Run:

```bash
cd '/mnt/data/dev/Other projects/SvagaPlus Server/backend'
FLASK_CLI=true PYTHONPATH=. .venv/bin/pytest -q tests/test_bebebendle_internal.py
```

Expected: FAIL because the route returns 404.

- [ ] **Step 4: Implement the endpoint**

Create `backend/routes/bebebendle_internal.py`:

```python
from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, jsonify, request

from models import TributeSubscription


bebebendle_internal_bp = Blueprint('bebebendle_internal', __name__)


def _error(code: str, message: str, status: int):
    return jsonify({
        'contract_version': 1,
        'error': {'code': code, 'message': message},
    }), status


def _authorized(configured_secret: str) -> bool:
    provided = request.headers.get('X-Internal-Secret', '')
    return hmac.compare_digest(provided.encode(), configured_secret.encode())


def _valid_payload(payload: Any) -> tuple[int | None, str | None]:
    if not isinstance(payload, dict):
        return None, 'request body must be a JSON object'
    if set(payload) != {'contract_version', 'telegram_user_id'}:
        return None, 'request body contains missing or unknown fields'
    if payload['contract_version'] != 1:
        return None, 'contract_version must equal 1'
    telegram_user_id = payload['telegram_user_id']
    if isinstance(telegram_user_id, bool) or not isinstance(telegram_user_id, int) or telegram_user_id <= 0:
        return None, 'telegram_user_id must be a positive integer'
    return telegram_user_id, None


@bebebendle_internal_bp.post('/subscription-status')
def subscription_status():
    secret = os.getenv('BEBEBENDLE_INTERNAL_SECRET', '')
    target_user_id = os.getenv('SVAGA_TARGET_USER_ID', '')
    if not secret or not target_user_id:
        return _error('integration_not_configured', 'Bebebendle integration is not configured', 503)
    if not _authorized(secret):
        return _error('unauthorized', 'invalid internal secret', 401)

    telegram_user_id, validation_error = _valid_payload(request.get_json(silent=True))
    if validation_error:
        return _error('invalid_request', validation_error, 400)

    is_subscriber = TributeSubscription.query.filter_by(
        user_id=target_user_id,
        telegram_user_id=telegram_user_id,
        is_active=True,
        is_banned=False,
    ).first() is not None

    checked_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    return jsonify({
        'contract_version': 1,
        'telegram_user_id': telegram_user_id,
        'target_user_id': target_user_id,
        'is_subscriber': is_subscriber,
        'checked_at': checked_at,
    })
```

In `backend/app.py`, import and register the blueprint inside `_register_blueprints`:

```python
from routes.bebebendle_internal import bebebendle_internal_bp

app.register_blueprint(
    bebebendle_internal_bp,
    url_prefix='/api/internal/bebebendle',
)
```

Append to `backend/.env.example`:

```dotenv
# Dedicated Bebebendle internal API credentials. Do not reuse BOT_SECRET.
BEBEBENDLE_INTERNAL_SECRET=replace-with-64-random-hex-characters
# SVAGA+ users.id for Olesha; all subscription checks are scoped to this owner.
SVAGA_TARGET_USER_ID=replace-with-olesha-user-uuid
```

- [ ] **Step 5: Run focused and full backend tests**

Run:

```bash
cd '/mnt/data/dev/Other projects/SvagaPlus Server/backend'
FLASK_CLI=true PYTHONPATH=. .venv/bin/pytest -q tests/test_bebebendle_internal.py
FLASK_CLI=true PYTHONPATH=. .venv/bin/pytest -q tests
```

Expected: both commands PASS.

- [ ] **Step 6: Check graph impact and commit SVAGA+ endpoint**

Run:

```bash
cd '/mnt/data/dev/Other projects/SvagaPlus Server'
node .gitnexus/run.cjs detect-changes --scope unstaged --repo svagaplus-server
git add backend/routes/bebebendle_internal.py backend/tests/test_bebebendle_internal.py backend/app.py backend/.env.example
git commit -m "feat(internal): expose scoped Bebebendle subscription status"
```

Expected: change report mentions only blueprint registration and the new internal request flow; commit succeeds.

## Task 2: Add Session and Tri-State Subscription Schema

**Repository:** `/mnt/data/dev/Other projects/svagaplus-bebebendle`

**Files:**
- Modify: `next/db/schema.ts`
- Create: `next/db/migrations/0005_secure_sessions_and_svaga_status.sql`
- Modify: `next/db/migrations/meta/_journal.json`

- [ ] **Step 1: Update the Drizzle schema**

First make the application and Drizzle Kit consume the same database DSN. Replace the current unconditional `new Client({ host, ... })` block in `next/db/schema.ts` with:

```ts
const client = new Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB || "bebendle",
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
    });
```

`DATABASE_URL` is authoritative in CI and on PM2 hosts; the split `POSTGRES_*` fallback remains only for current local Compose compatibility.

Then add `index` to the `drizzle-orm/pg-core` import. Change the user status fields and scran snapshot field, then add `userSessions`:

```ts
export const users = pgTable("users", {
  // existing identity/profile fields remain unchanged
  isSubscriber: boolean("is_subscriber"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncAttemptAt: timestamp("last_sync_attempt_at"),
  lastSyncError: text("last_sync_error"),
  // legacy svagaTelegramUserId/svagaUserId/linkedAt stay for rollback compatibility but are no longer written
});

export const userSessions = pgTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull().unique(),
  familyId: text("family_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedBySessionId: text("replaced_by_session_id"),
  userAgentHash: text("user_agent_hash"),
}, (table) => ({
  familyIdx: index("user_sessions_family_id_idx").on(table.familyId),
  userIdx: index("user_sessions_user_id_idx").on(table.userId),
}));
```

Change `scrans.isSubscriberAtSubmit` to:

```ts
isSubscriberAtSubmit: boolean("is_subscriber_at_submit"),
```

Export `UserSession`:

```ts
export type UserSession = typeof userSessions.$inferSelect;
```

- [ ] **Step 2: Create the forward migration**

Create `next/db/migrations/0005_secure_sessions_and_svaga_status.sql`:

```sql
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" text PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token_hash" text NOT NULL UNIQUE,
  "family_id" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "last_used_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "absolute_expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "replaced_by_session_id" text,
  "user_agent_hash" text
);

CREATE INDEX IF NOT EXISTS "user_sessions_family_id_idx" ON "user_sessions" ("family_id");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" ("user_id");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_attempt_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_error" text;
ALTER TABLE "users" ALTER COLUMN "is_subscriber" DROP DEFAULT;
UPDATE "users" SET "is_subscriber" = NULL WHERE "last_synced_at" IS NULL;

ALTER TABLE "scrans" ALTER COLUMN "is_subscriber_at_submit" DROP DEFAULT;

-- Legacy rows were written before foreign keys existed. Preserve the row and
-- clear only an invalid optional association before adding the constraints.
UPDATE "scrans" AS s
SET "submitted_by_user_id" = NULL
WHERE "submitted_by_user_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = s."submitted_by_user_id");

UPDATE "daily_user_results" AS d
SET "user_id" = NULL
WHERE "user_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = d."user_id");

DO $$ BEGIN
  ALTER TABLE "scrans"
    ADD CONSTRAINT "scrans_submitted_by_user_id_users_id_fk"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "daily_user_results"
    ADD CONSTRAINT "daily_user_results_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

- [ ] **Step 3: Normalize the migration journal**

Replace `next/db/migrations/meta/_journal.json` entries with one entry per SQL migration, preserving version 7 and using indices 0 through 5:

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    { "idx": 0, "version": "7", "when": 1739683200000, "tag": "0000_initial", "breakpoints": true },
    { "idx": 1, "version": "7", "when": 1740163200000, "tag": "0001_add_telegram_id", "breakpoints": true },
    { "idx": 2, "version": "7", "when": 1740249600000, "tag": "0002_add_fingerprint_and_unique_indexes", "breakpoints": true },
    { "idx": 3, "version": "7", "when": 1750032000000, "tag": "0003_add_icon_to_scrans", "breakpoints": true },
    { "idx": 4, "version": "7", "when": 1752100000000, "tag": "0004_add_users_and_svaga_linking", "breakpoints": true },
    { "idx": 5, "version": "7", "when": 1784203200000, "tag": "0005_secure_sessions_and_svaga_status", "breakpoints": true }
  ]
}
```

- [ ] **Step 4: Apply the migration to a disposable database**

Run:

```bash
cd next
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bebendle_test bunx drizzle-kit migrate
```

Expected: migration 0005 applies once. Run the same command again and expect no changes.

- [ ] **Step 5: Commit the schema**

```bash
git add next/db/schema.ts next/db/migrations/0005_secure_sessions_and_svaga_status.sql next/db/migrations/meta/_journal.json
git commit -m "feat(auth): add refresh sessions and tri-state subscription fields"
```

## Task 3: Implement Signed Access Tokens

**Files:**
- Create: `next/tests/lib/session-token.test.ts`
- Create: `next/lib/session-token.ts`

- [ ] **Step 1: Write failing access-token tests**

Create `next/tests/lib/session-token.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "@/lib/session-token";

const secret = "0123456789abcdef0123456789abcdef";
const now = new Date("2026-07-16T12:00:00Z");

describe("session access token", () => {
  it("round-trips valid claims", () => {
    const token = signAccessToken({ sessionId: "s1", userId: 7, telegramId: "123" }, secret, now);
    expect(verifyAccessToken(token, secret, new Date("2026-07-16T12:59:59Z"))).toMatchObject({
      version: 1,
      sessionId: "s1",
      userId: 7,
      telegramId: "123",
    });
  });

  it("rejects tampering and the old raw Telegram ID cookie", () => {
    const token = signAccessToken({ sessionId: "s1", userId: 7, telegramId: "123" }, secret, now);
    expect(verifyAccessToken(`${token}x`, secret, now)).toBeNull();
    expect(verifyAccessToken("123456789", secret, now)).toBeNull();
  });

  it("rejects expiry, future issue time, and wrong secret", () => {
    const token = signAccessToken({ sessionId: "s1", userId: 7, telegramId: "123" }, secret, now);
    expect(verifyAccessToken(token, secret, new Date("2026-07-16T13:00:01Z"))).toBeNull();
    expect(verifyAccessToken(token, "abcdef0123456789abcdef0123456789", now)).toBeNull();
    expect(verifyAccessToken(token, secret, new Date("2026-07-16T11:54:59Z"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd next && bun run test:run tests/lib/session-token.test.ts`

Expected: FAIL because `@/lib/session-token` does not exist.

- [ ] **Step 3: Implement the HMAC token module**

Create `next/lib/session-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const ACCESS_TTL_SECONDS = 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export type AccessClaims = Readonly<{
  version: 1;
  sessionId: string;
  userId: number;
  telegramId: string;
  issuedAt: number;
  expiresAt: number;
}>;

type ClaimsInput = Pick<AccessClaims, "sessionId" | "userId" | "telegramId">;

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function validClaims(value: unknown): value is AccessClaims {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return c.version === 1
    && typeof c.sessionId === "string" && c.sessionId.length > 0
    && Number.isInteger(c.userId) && Number(c.userId) > 0
    && typeof c.telegramId === "string" && /^\d+$/.test(c.telegramId)
    && Number.isInteger(c.issuedAt)
    && Number.isInteger(c.expiresAt);
}

export function signAccessToken(input: ClaimsInput, secret: string, now = new Date()): string {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims: AccessClaims = {
    version: 1,
    ...input,
    issuedAt,
    expiresAt: issuedAt + ACCESS_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyAccessToken(token: string, secret: string, now = new Date()): AccessClaims | null {
  if (secret.length < 32) return null;
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return null;
  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!validClaims(claims)) return null;
    const timestamp = Math.floor(now.getTime() / 1000);
    if (claims.issuedAt > timestamp + MAX_CLOCK_SKEW_SECONDS) return null;
    if (claims.expiresAt <= timestamp) return null;
    return claims;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test and commit**

```bash
cd next
bun run test:run tests/lib/session-token.test.ts
cd ..
git add next/lib/session-token.ts next/tests/lib/session-token.test.ts
git commit -m "feat(auth): sign and verify short-lived access tokens"
```

Expected: 3 tests PASS.

## Task 4: Implement Refresh Rotation and Replay Revocation

**Files:**
- Create: `next/lib/session-manager.ts`
- Create: `next/lib/session-repository.ts`
- Create: `next/tests/lib/session-manager.test.ts`

- [ ] **Step 1: Write behavior tests against an in-memory repository**

Create `next/tests/lib/session-manager.test.ts` with a `MemorySessionRepository` implementing the exported interface. The required assertions are:

```ts
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
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd next && bun run test:run tests/lib/session-manager.test.ts`

Expected: FAIL because the manager does not exist.

- [ ] **Step 3: Implement the manager contract**

Create `next/lib/session-manager.ts`. Use these exact constants and public types:

```ts
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
```

Create `next/lib/session-repository.ts`. The join is required because the session table deliberately does not duplicate Telegram identity:

```ts
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
```

Never log raw refresh tokens or their hashes.

- [ ] **Step 4: Run tests and commit**

```bash
cd next
bun run test:run tests/lib/session-manager.test.ts tests/lib/session-token.test.ts
cd ..
git add next/lib/session-manager.ts next/lib/session-repository.ts next/tests/lib/session-manager.test.ts
git commit -m "feat(auth): rotate refresh sessions and revoke replayed families"
```

Expected: all session tests PASS.

## Task 5: Wire Login, Refresh, Logout, and Server Authentication

**Files:**
- Create: `next/lib/session-cookies.ts`
- Modify: `next/lib/auth-server.ts`
- Modify: `next/app/api/auth/telegram/route.ts`
- Create: `next/app/api/auth/refresh/route.ts`
- Create: `next/app/api/auth/session/route.ts`
- Create: `next/tests/lib/session-cookies.test.ts`

- [ ] **Step 1: Add cookie policy tests**

Test that staging/production cookies are `secure`, development cookies are not, access max-age is `3600`, refresh max-age never exceeds the supplied expiry, and clearing removes `bebebendle_access`, `bebebendle_refresh`, and legacy `bebebendle_session`.

- [ ] **Step 2: Implement cookie helpers**

Create `next/lib/session-cookies.ts` with these exports:

```ts
import type { NextResponse } from "next/server";

export const ACCESS_COOKIE = "bebebendle_access";
export const REFRESH_COOKIE = "bebebendle_refresh";
export const LEGACY_COOKIE = "bebebendle_session";

function secureCookies(): boolean {
  return process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}

export function setSessionCookies(
  response: NextResponse,
  issued: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  now = new Date(),
): void {
  const common = { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/" };
  response.cookies.set(ACCESS_COOKIE, issued.accessToken, { ...common, maxAge: 60 * 60 });
  response.cookies.set(REFRESH_COOKIE, issued.refreshToken, {
    ...common,
    maxAge: Math.max(0, Math.floor((issued.refreshExpiresAt.getTime() - now.getTime()) / 1000)),
  });
  response.cookies.set(LEGACY_COOKIE, "", { ...common, expires: new Date(0) });
}

export function clearSessionCookies(response: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE]) {
    response.cookies.set(name, "", { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", expires: new Date(0) });
  }
}
```

- [ ] **Step 3: Replace raw-cookie authentication**

In `next/lib/auth-server.ts`, read `bebebendle_access`, require `SESSION_SECRET`, call `verifyAccessToken`, and query `users` joined to `userSessions` using both claim IDs. Require `userSessions.revokedAt IS NULL` and `userSessions.absoluteExpiresAt > now`. Do not read `bebebendle_session`.

The exported `getCurrentUser()` return type stays unchanged so existing role guards do not require unrelated rewrites.

- [ ] **Step 4: Issue both tokens on Telegram login**

Before parsing login JSON, enforce `checkRateLimit("auth:" + getClientIp(request), 10, 60, "closed")`; return `429` with `Retry-After` when denied. Preserve the 24-hour maximum Telegram auth age, but reject `auth_date` more than five minutes in the future rather than using a symmetric absolute difference. Add both boundary cases to `telegram-auth.test.ts`.

After the user upsert in `next/app/api/auth/telegram/route.ts`, create a session with the production repository/manager and call `setSessionCookies`. Remove the old `response.cookies.set("bebebendle_session", ...)` block. Use `request.headers.get("user-agent")` only for its hash.

- [ ] **Step 5: Add refresh and session routes**

Create `next/app/api/auth/refresh/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from "@/lib/session-cookies";

export async function POST() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "session_not_configured" }, { status: 503 });
  }
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "refresh_required" }, { status: 401 });

  const result = await createSessionManager(sessionRepository, { sessionSecret: secret }).rotate(refreshToken);
  if (result.status !== "ok") {
    const response = NextResponse.json({ error: result.status }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ success: true });
  setSessionCookies(response, result);
  return response;
}
```

Apply a separate closed Redis limit of 30 refresh attempts per client IP per 60 seconds before token rotation. This bounds hash/database work without sharing the stricter login bucket.

Create `next/app/api/auth/session/route.ts` with `GET` returning the authenticated user and `DELETE` revoking the refresh token through the manager, then clearing all three cookie names. Remove the DELETE handler from `api/auth/telegram/route.ts`.

- [ ] **Step 6: Run auth-focused checks and commit**

```bash
cd next
bun run test:run tests/lib/session-token.test.ts tests/lib/session-manager.test.ts tests/lib/session-cookies.test.ts tests/lib/telegram-auth.test.ts
bun run lint -- lib/session-token.ts lib/session-manager.ts lib/session-repository.ts lib/session-cookies.ts lib/auth-server.ts app/api/auth
cd ..
git add next/lib next/app/api/auth next/tests/lib/session-cookies.test.ts
git commit -m "feat(auth): issue rotating access and refresh sessions"
```

Expected: focused tests and lint PASS.

## Task 6: Add One-Retry Client Refresh

**Files:**
- Create: `next/lib/api-client.ts`
- Create: `next/tests/lib/api-client.test.ts`
- Modify: `next/hooks/use-admin-auth.ts`
- Modify: `next/hooks/use-scrans-data.ts`
- Modify: `next/hooks/use-scran-mutations.ts`
- Modify: `next/app/profile/page.tsx`

- [ ] **Step 1: Test single-flight refresh**

Create tests proving: a 200 response is returned unchanged; one 401 triggers one refresh and one retry; five simultaneous 401 responses share one refresh request; a failed refresh returns the original 401 without an infinite loop.

- [ ] **Step 2: Implement `apiFetch`**

Create `next/lib/api-client.ts`:

```ts
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", { method: "POST" });
  return response.ok;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;

  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  if (!await refreshInFlight) return response;
  return fetch(input, init);
}
```

- [ ] **Step 3: Use the wrapper for authenticated browser calls**

Replace authenticated `fetch` calls in admin hooks and profile with `apiFetch`. Change logout to `DELETE /api/auth/session`. Keep Telegram login and the refresh request itself on native `fetch` to avoid recursion.

For approve/delete server actions, switch the hook to the existing authenticated approve route and a new `DELETE /api/admin/scrans/[id]` route so every browser mutation can use `apiFetch`. Move the existing delete validation/notification body from `next/app/admin/actions.ts` into the route, then delete the unused server-action exports only after `rg` shows zero callers.

- [ ] **Step 4: Run tests and commit**

```bash
cd next
bun run test:run tests/lib/api-client.test.ts
bun run lint -- lib/api-client.ts hooks app/profile app/api/admin
cd ..
git add next/lib/api-client.ts next/tests/lib/api-client.test.ts next/hooks next/app/profile next/app/api/admin next/app/admin/actions.ts
git commit -m "feat(auth): refresh expired browser sessions once"
```

## Task 7: Replace the SVAGA+ Client with the V1 Contract

**Files:**
- Modify: `next/lib/svaga.ts`
- Replace: `next/tests/lib/svaga.test.ts`

- [ ] **Step 1: Replace stale tests with contract tests**

Tests must set env before each call without relying on module re-import, assert the new URL `/api/internal/bebebendle/subscription-status`, assert `contract_version: 1`, and cover snake_case success, 401, timeout, 500, invalid JSON, wrong target, and missing config.

Use expected results such as:

```ts
expect(await getSubscriberStatus(123)).toEqual({
  status: "ok",
  isSubscriber: true,
  checkedAt: new Date("2026-07-16T12:00:00Z"),
});

expect(await getSubscriberStatus(123)).toEqual({
  status: "unavailable",
  reason: "timeout",
});
```

- [ ] **Step 2: Implement runtime configuration and strict validation**

Replace top-level env constants in `next/lib/svaga.ts` with a per-call config read. Use `SVAGAPLUS_INTERNAL_URL`, `SVAGAPLUS_INTERNAL_SECRET`, and `SVAGA_TARGET_USER_ID`. The request body and response validation must match Task 1 exactly. Reject a 200 response when `target_user_id` differs from local `SVAGA_TARGET_USER_ID`.

The public result type is:

```ts
export type SvagaCheckResult =
  | { status: "ok"; isSubscriber: boolean; checkedAt: Date }
  | {
      status: "unavailable";
      reason: "not_configured" | "timeout" | "unauthorized" | "upstream" | "invalid_response";
    };
```

- [ ] **Step 3: Run tests and commit**

```bash
cd next
bun run test:run tests/lib/svaga.test.ts
bun run lint -- lib/svaga.ts tests/lib/svaga.test.ts
cd ..
git add next/lib/svaga.ts next/tests/lib/svaga.test.ts
git commit -m "feat(svaga): consume the scoped v1 subscription contract"
```

## Task 8: Implement Fresh, Cache, Stale, and Unknown Resolution

**Files:**
- Create: `next/lib/svaga-status-service.ts`
- Create: `next/tests/lib/svaga-status-service.test.ts`
- Modify: `next/app/api/internal/svaga/subscription-status/route.ts`
- Create: `next/app/api/svaga/refresh/route.ts`
- Delete: `next/app/api/svaga/link/route.ts`
- Modify: `next/app/api/svaga/status/route.ts`

- [ ] **Step 1: Write service tests with a fake repository**

Cover these exact cases:

```ts
// cache younger than one hour: source cache, upstream not called
expect(result).toEqual({ isSubscriber: true, source: "cache", checkedAt: cachedAt });

// stale cache + upstream success: source fresh and saveSuccess called
expect(result).toEqual({ isSubscriber: false, source: "fresh", checkedAt: upstreamAt });

// stale cache + timeout: preserve prior value and successful timestamp
expect(result).toEqual({ isSubscriber: true, source: "stale_cache", checkedAt: cachedAt, error: "timeout" });

// no cache + timeout: never invent false
expect(result).toEqual({ isSubscriber: null, source: "unknown", checkedAt: null, error: "timeout" });
```

- [ ] **Step 2: Implement an injectable status service**

Create `next/lib/svaga-status-service.ts` with `SvagaStatusRepository`, `ResolvedSvagaStatus`, and `createSvagaStatusService(repository, fetchStatus)`. Use a one-hour TTL. `saveSuccess` updates `isSubscriber`, `lastSyncedAt`, `lastSyncAttemptAt`, and clears `lastSyncError`; `saveFailure` updates only attempt/error fields.

Export a production instance backed by `users` and `getSubscriberStatus`.

- [ ] **Step 3: Simplify HTTP routes around the service**

The internal bot route keeps `X-Internal-Secret`, input validation, and rate limiting, then returns:

```json
{
  "isSubscriber": null,
  "source": "unknown",
  "checkedAt": null,
  "error": "timeout"
}
```

The user refresh route requires `getCurrentUser`. It returns `200` only for `fresh`/`cache`; for `stale_cache` or `unknown`, return `503` with the resolved cached payload so the UI can display both the old status and the refresh error.

The status GET route never calls upstream. It maps local fields to `subscriber`, `not_subscriber`, or `unknown`, plus last success/attempt/error timestamps.

- [ ] **Step 4: Run tests and commit**

```bash
cd next
bun run test:run tests/lib/svaga.test.ts tests/lib/svaga-status-service.test.ts
bun run lint -- lib/svaga.ts lib/svaga-status-service.ts app/api/svaga app/api/internal/svaga
cd ..
git add next/lib/svaga-status-service.ts next/tests/lib/svaga-status-service.test.ts next/app/api/svaga next/app/api/internal/svaga
git commit -m "feat(svaga): preserve stale status and expose unknown checks"
```

## Task 9: Store Nullable Bot Snapshots and Close the Pending-Cap Race

**Files:**
- Modify: `bot/src/main.py`
- Modify: `bot/src/database.py`
- Modify: `bot/tests/test_svaga_helper.py`
- Create: `bot/tests/test_database_config.py`

- [ ] **Step 1: Rewrite helper tests around a typed nullable result**

Add this type to the expected API:

```python
@dataclass(frozen=True)
class SubscriberSnapshot:
    is_subscriber: bool | None
    checked_at: datetime | None
    source: Literal['fresh', 'cache', 'stale_cache', 'unknown']
```

Tests must assert `unknown -> None`, stale cache preserves its boolean and timestamp, malformed JSON becomes unknown, and the request still carries `X-Internal-Secret`.

- [ ] **Step 2: Implement nullable parsing**

Change `get_svaga_subscriber_status` to return `SubscriberSnapshot`. Parse `checkedAt` with `datetime.fromisoformat(value.replace("Z", "+00:00"))`. Any network/config/HTTP/JSON error returns `SubscriberSnapshot(None, None, "unknown")`.

Make `Database.connect` use the same DSN as migrations and Next runtime. Add a focused test that monkeypatches `asyncpg.create_pool`, sets `DATABASE_URL`, and asserts it was called with that DSN. Keep the current `POSTGRES_*` fallback for local Compose:

```python
database_url = os.getenv('DATABASE_URL')
if database_url:
    self.pool = await asyncpg.create_pool(
        dsn=database_url,
        min_size=1,
        max_size=10,
    )
else:
    self.pool = await asyncpg.create_pool(
        host=os.getenv('POSTGRES_HOST', 'localhost'),
        port=int(os.getenv('POSTGRES_PORT', '5432')),
        database=os.getenv('POSTGRES_DB', 'bebendle'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'postgres'),
        min_size=1,
        max_size=10,
    )
```

- [ ] **Step 3: Make insert race-safe**

Change `Database.insert_scran` parameters to:

```python
is_subscriber: bool | None,
subscriber_checked_at: datetime | None,
```

Inside one acquired connection and transaction:

```python
async with connection.transaction():
    telegram_int = int(telegram_id)
    await connection.execute("SELECT pg_advisory_xact_lock($1)", telegram_int)
    pending = await connection.fetchval(
        "SELECT COUNT(*) FROM scrans WHERE telegram_id = $1 AND approved = false",
        telegram_id,
    )
    if pending >= 6:
        raise PendingSuggestionLimitError
    # lookup user_id and INSERT, passing subscriber_checked_at instead of NOW()
```

Define `PendingSuggestionLimitError` in `database.py`. Keep the early count in `process_confirmation` to avoid the upstream call when already over limit, but catch the database exception to close the concurrency race.

- [ ] **Step 4: Run bot checks and commit**

```bash
cd bot
uv run --extra dev ruff check src tests
uv run --extra dev mypy src
uv run --extra dev pytest -q
cd ..
git add bot/src/main.py bot/src/database.py bot/tests/test_svaga_helper.py bot/tests/test_database_config.py
git commit -m "feat(bot): preserve unknown SVAGA snapshots safely"
```

Expected: Ruff, MyPy, and pytest PASS.

## Task 10: Make Profile and Admin UX Truthful and Accessible

**Files:**
- Modify: `next/app/profile/page.tsx`
- Create: `next/components/telegram-login.tsx`
- Modify: `next/components/admin/login-form.tsx`
- Modify: `next/app/page.tsx`
- Modify: `next/components/admin/scran-row.tsx`
- Modify: `next/tests/components/ScranRow.test.tsx`
- Create: `next/tests/components/ProfileSvagaStatus.test.tsx`

- [ ] **Step 1: Extract a shared typed Telegram login component**

Move widget loading out of `admin/login-form.tsx`. Declare the Telegram payload instead of `any`:

```ts
type TelegramLoginUser = Readonly<{
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}>;
```

Expose `onAuthenticated` and `context: "player" | "admin"`. Player copy says "Войти через Telegram"; admin copy explains the role requirement after authentication.

- [ ] **Step 2: Replace the profile SVAGA section**

Use Russian labels only:

- Heading: `Подписка СВАГА+`.
- Action: `Проверить подписку`.
- Confirmed true: `Подписка на Olesha активна`.
- Confirmed false: `Активная подписка на Olesha не найдена`.
- Unknown: `Статус подписки пока не удалось проверить`.
- Stale/error: keep the cached badge and show `Не удалось обновить статус; показаны последние подтверждённые данные` with `role="alert"`.
- Success: `Статус подписки обновлён` with `role="status"` and `aria-live="polite"`.
- Show date and time via `toLocaleString("ru-RU")`.

Call `/api/svaga/refresh`, inspect both HTTP status and JSON body, and never treat `{ source: "unknown" }` as success.

- [ ] **Step 3: Add discoverability and null moderation state**

Add a visible `/profile` link near the primary home actions. In `ScranRow`, render `SVAGA+` only for `true`; render `Не проверено` for `null`; render no badge for confirmed false. Give action buttons a minimum 44px touch target and add focus-visible styles.

- [ ] **Step 4: Add component tests**

Test the three subscription states, stale error copy, success live region, player login copy, and the null moderation badge. Do not snapshot the whole page; assert roles and user-visible strings.

- [ ] **Step 5: Run component checks and commit**

```bash
cd next
bun run test:run tests/components/ProfileSvagaStatus.test.tsx tests/components/ScranRow.test.tsx
bun run lint -- app/profile app/page.tsx components/telegram-login.tsx components/admin components/admin/scran-row.tsx
cd ..
git add next/app/profile next/app/page.tsx next/components next/tests/components
git commit -m "feat(profile): present scoped SVAGA status truthfully"
```

## Task 11: Repair the Existing Quality Gate and Documentation

**Files:**
- Modify: current files reported by ESLint and failing Vitest suites.
- Modify: `.env.sample`
- Modify: `README.md`
- Modify: `bot/README.md`

- [ ] **Step 1: Update environment documentation**

Replace the shared `INTERNAL_SECRET` model with:

```dotenv
APP_ENV=development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bebendle
SESSION_SECRET=replace-with-64-random-hex-characters
SVAGAPLUS_INTERNAL_URL=http://127.0.0.1:5016
SVAGAPLUS_INTERNAL_SECRET=replace-with-the-dedicated-svaga-secret
SVAGA_TARGET_USER_ID=replace-with-olesha-user-uuid
BEBEBENDLE_INTERNAL_SECRET=replace-with-a-separate-bot-to-bebebendle-secret
BEBEBENDLE_INTERNAL_URL=http://127.0.0.1:3000
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_username
```

On the bot side, send `BEBEBENDLE_INTERNAL_SECRET`; on the Next internal route, validate that variable. Do not reuse the SVAGA+ caller secret.

- [ ] **Step 2: Fix stale existing tests**

Update countdown, daily button, share text, and moderation tests to assert current intentional behavior. A failing test may be changed only after comparing it to the current product behavior; do not blindly change expected strings to green the suite.

- [ ] **Step 3: Fix all ESLint errors**

Address the reported `prefer-const`, `no-explicit-any`, unused variables, and `set-state-in-effect` errors. For data-loading effects, start the async work from the effect without synchronously setting state in the effect body, or move state initialization before the effect. Do not disable the rules globally.

- [ ] **Step 4: Run the complete local gate**

```bash
cd next
bun run lint
bun run test:run
bun run build
cd ../bot
uv run --extra dev ruff check src tests
uv run --extra dev mypy src
uv run --extra dev pytest -q
```

Expected: every command exits 0, with no skipped integration/security test caused by missing implementation.

- [ ] **Step 5: Commit gate repairs and docs**

```bash
git add .env.sample README.md bot/README.md next bot/tests
git commit -m "test: enforce session and SVAGA integration gates"
```

## Task 12: Cross-Repository Staging Verification

**Files:**
- Create: `docs/runbooks/svaga-integration-smoke.md`

- [ ] **Step 1: Document exact smoke commands**

The runbook must use environment variables rather than literal secrets:

```bash
curl -fsS -X POST "$SVAGAPLUS_URL/api/internal/bebebendle/subscription-status" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SVAGAPLUS_INTERNAL_SECRET" \
  --data '{"contract_version":1,"telegram_user_id":123456789}'

curl -fsS "$BEBEBENDLE_URL/api/health/ready"
```

Include four staging fixtures: active Olesha subscriber, inactive Olesha subscriber, active subscriber to a different owner, and unknown Telegram ID. Record only IDs created specifically for staging.

- [ ] **Step 2: Verify rollout order**

1. Deploy Task 1 to SVAGA+ staging with `SVAGA_TARGET_USER_ID` and `BEBEBENDLE_INTERNAL_SECRET` configured.
2. Verify direct endpoint results for all four fixtures.
3. Deploy Bebebendle Tasks 2-11 to staging.
4. Log in once because legacy raw cookies are intentionally rejected.
5. Verify access expiry/refresh rotation, logout, profile refresh, bot submission, null outage behavior, and moderator badges.
6. Temporarily point `SVAGAPLUS_INTERNAL_URL` to an unused local port, restart Bebebendle, and verify stale/unknown behavior; restore the URL immediately after the check.

- [ ] **Step 3: Run final repository checks**

```bash
git status --short
git diff --check
git log --oneline -12
git -C '/mnt/data/dev/Other projects/SvagaPlus Server' status --short
git -C '/mnt/data/dev/Other projects/SvagaPlus Server' diff --check
git -C '/mnt/data/dev/Other projects/SvagaPlus Server' log --oneline -5
```

Expected: only intended tracked changes, clean whitespace checks, and focused commits in the documented order.

- [ ] **Step 4: Commit the smoke runbook**

```bash
git add docs/runbooks/svaga-integration-smoke.md
git commit -m "docs: add SVAGA integration staging smoke runbook"
```

## Plan 1 Completion Gate

Do not begin the PM2 CI/CD plan until all conditions below are true:

- SVAGA+ endpoint tests and full backend suite pass.
- Bebebendle session, client, cache, component, and full frontend suites pass.
- Bot Ruff, MyPy, and pytest pass.
- No raw Telegram ID cookie is accepted.
- Refresh replay revokes the family.
- Cross-owner subscriptions do not grant priority.
- Upstream outage produces stale or unknown, never invented false.
- The cross-repository staging smoke runbook has been executed successfully once.
