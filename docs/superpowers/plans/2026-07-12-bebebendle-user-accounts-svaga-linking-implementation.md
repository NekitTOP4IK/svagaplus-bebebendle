# Bebebendle User Accounts, SVAGA+ Linking, Roles & Moderation Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement proper local user accounts in bebebendle (Telegram-primary), optional SVAGA+ linking for subscriber status, RBAC (player/moderator/admin), hybrid moderation queue with fairness, player profile/history, and update the bot to capture subscriber info at suggestion time. Keep anonymous play fully working.

**Architecture:**
- Telegram is the primary identity for bebebendle users.
- Local `users` table (per-project users are intentional).
- Optional link to svagaplus-server via `telegram_user_id` + `tribute_user_id`.
- Subscriber status is cached with snapshots on `scrans`.
- Bot gets status via internal bebebendle API (Variant 1).
- Moderation queue uses hybrid scoring + interleaving.
- Roles live on local users.

**Tech Stack:**
- Next.js (Drizzle + pg)
- Python aiogram bot
- Internal protected APIs between services (shared secret)
- Telegram Login Widget for site auth

---

## Task 1: Database Schema & Migration

**Status: COMPLETED** (by subagent 019f5743-156a-71e3-9690-5cf3c8b08bec)

**Files:**
- Create: `next/db/schema.ts` (add users, svaga link fields, extend scrans & daily_user_results)
- Create: `next/db/migrations/0004_add_users_and_svaga_linking.sql` (or use drizzle generate)
- Modify: `next/drizzle.config.ts` (if needed)

- [x] **Step 1: Design and add new tables/columns in schema.ts**

Add the following (use `bigint` for telegram ids, `serial` for ids):

```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  telegramUsername: text("telegram_username"),
  displayName: text("display_name"),
  role: text("role", { enum: ["player", "moderator", "admin"] }).notNull().default("player"),
  svagaTelegramUserId: bigint("svaga_telegram_user_id", { mode: "number" }),
  svagaUserId: text("svaga_user_id"),           // tribute_user_id from svagaplus
  isSubscriber: boolean("is_subscriber").default(false),
  lastSyncedAt: timestamp("last_synced_at"),
  linkedAt: timestamp("linked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scrans = pgTable("scrans", {
  // ... existing fields
  submittedByUserId: integer("submitted_by_user_id").references(() => users.id),
  isSubscriberAtSubmit: boolean("is_subscriber_at_submit").default(false),
  subscriberCheckedAt: timestamp("subscriber_checked_at"),
  // ...
});

export const dailyUserResults = pgTable("daily_user_results", {
  // ... existing
  userId: integer("user_id").references(() => users.id),
  // keep sessionId + fingerprint for anonymous
});
```

- [x] **Step 2: Generate or write migration**

Run:
```bash
cd next
bunx drizzle-kit generate
```

Or manually create `0004_add_users_and_svaga_linking.sql` with proper indexes:

```sql
CREATE TABLE IF NOT EXISTS "users" (...);
ALTER TABLE scrans ADD COLUMN ...;
CREATE INDEX IF NOT EXISTS ... ON users(telegram_id);
CREATE INDEX IF NOT EXISTS ... ON scrans(submitted_by_user_id);
```

- [x] **Step 3: Run migration locally and in Docker**

```bash
make migrate
```

- [x] **Step 4: Commit**

```bash
git add next/db/
git commit -m "feat(db): add users table + svaga linking fields + subscriber snapshots"
```

---

## Task 2: Telegram Authentication on Next.js Site

**Files:**
- `next/app/api/auth/telegram/route.ts` (or use next-auth if we add it later — keep simple for now)
- `next/lib/auth.ts` (session helpers)
- `next/app/login/page.tsx` or integrate into existing layout
- Update `next/app/admin/...` and profile routes to use new auth

- [ ] **Step 1: Create Telegram Login verification utility**

```ts
// next/lib/telegram-auth.ts
export function verifyTelegramAuth(data: Record<string, string>, botToken: string): boolean {
  // implement hash check using crypto
}
export function parseTelegramUser(data: any): { telegramId: number; username?: string; firstName?: string }
```

- [ ] **Step 2: Create auth endpoint**

`POST /api/auth/telegram` — receives data from widget, verifies, upserts user, sets httpOnly session cookie (or JWT).

- [ ] **Step 3: Add server-side session helper**

```ts
// next/lib/auth-server.ts
export async function getCurrentUser() { ... }
export async function requireRole(role: 'moderator' | 'admin')
```

- [ ] **Step 4: Add simple login UI** (reuse or create minimal page with Telegram widget script)

- [ ] **Step 5: Protect existing admin routes** (replace old ADMIN_PASSWORD check with role check)

- [ ] **Step 6: Write basic tests** for verification function

- [ ] **Step 7: Commit**

---

## Task 3: SVAGA+ Linking Endpoints & Logic

**Files:**
- `next/app/api/svaga/link/route.ts`
- `next/app/api/svaga/status/route.ts` (public for user)
- `next/lib/svaga.ts` (internal client)
- Update `next/db/schema.ts` usage

- [ ] **Step 1: Add internal SVAGA client**

```ts
// next/lib/svaga-client.ts
export async function getSubscriberStatus(telegramUserId: number): Promise<{
  isSubscriber: boolean;
  tributeUserId?: string;
}>
```

Call svagaplus internal endpoint with `INTERNAL_SECRET`.

- [ ] **Step 2: Implement linking endpoint**

- Authenticated user calls it.
- Calls svagaplus, stores `svaga_user_id`, `is_subscriber`, timestamps.
- Returns current status.

- [ ] **Step 3: Internal endpoint for bot**

`GET /api/internal/svaga/subscription-status?telegram_id=...`

- Protected by `X-Internal-Secret`
- Returns cached or fresh status
- Triggers refresh if stale (> 1 hour)

- [ ] **Step 4: Add "Link SVAGA+" button + status display in profile (later task)**

- [ ] **Step 5: Commit**

---

## Task 4: Update Bot to Fetch Subscriber Status

**Files:**
- `bot/src/main.py` (suggest flow)
- `bot/src/database.py` (extend insert_scran)
- Add simple HTTP client for bebebendle internal API

- [ ] **Step 1: Add config for internal calls**

Environment: `BEBEBENDLE_INTERNAL_URL`, `INTERNAL_SECRET`

- [ ] **Step 2: Create helper**

```python
async def get_svaga_subscriber_status(telegram_id: str) -> bool:
    # POST or GET to bebebendle /api/internal/svaga/subscription-status
    ...
```

- [ ] **Step 3: Modify suggestion confirmation**

In `process_confirmation`:
```python
is_sub = await get_svaga_subscriber_status(data["telegram_id"])
await database.insert_scran(..., is_subscriber=is_sub)
```

- [ ] **Step 4: Update `insert_scran` signature and SQL**

Add parameters and columns for `is_subscriber_at_submit`.

- [ ] **Step 5: Update `get_user_scrans` if needed** to show subscriber info later.

- [ ] **Step 6: Test manually + add pytest for the helper (with mock)**

- [ ] **Step 7: Commit**

---

## Task 5: Hybrid Moderation Queue in Admin

**Files:**
- `next/app/api/admin/scrans/route.ts` (add queue mode)
- `next/components/admin/...` (update table or new queue view)
- `next/lib/moderation-queue.ts` (pure logic for scoring + interleaving)

- [ ] **Step 1: Implement queue scoring logic** (pure function, easy to test)

```ts
export function computeQueueScore(scran: ScranWithMeta, pendingCount: number, hoursWaiting: number)
```

- [ ] **Step 2: Create interleaving merger**

Function that takes subscriber list + regular list and produces fair ordered list (3:1).

- [ ] **Step 3: Update admin scrans API**

Support `?view=queue&subscriber_only=true/false`

Fetch pending with joins to users for role/subscriber data, compute scores, interleave, paginate the result.

- [ ] **Step 4: Show in UI**
  - Counts: "Subscribers: X | Regular: Y"
  - Badge for subscriber scrans
  - "(4 на модерации)" next to author
  - Simple filter toggle

- [ ] **Step 5: Enforce max 6 pending per user** (in insert + in queue display warning)

- [ ] **Step 6: Add tests** for computeQueueScore and interleave functions

- [ ] **Step 7: Commit**

---

## Task 6: User Profile & History

**Files:**
- `next/app/profile/page.tsx` (new)
- `next/app/api/user/profile/route.ts`
- `next/app/api/user/history/route.ts`

- [ ] **Step 1: API to return user's scrans + play history**

Join `daily_user_results` + daily scrandles for scores.

- [ ] **Step 2: Create profile page**

- List of my scrans (status, date if approved)
- Play history table (date, score, link to results if possible)
- SVAGA+ link status + "Refresh" / "Link" button

- [ ] **Step 3: Wire linking button** to the endpoint from Task 3

- [ ] **Step 4: Commit**

---

## Task 7: Role-Based Access & Admin Hardening

**Files:**
- All admin routes and server actions
- `next/hooks/use-admin-auth.ts` (now real user-based)
- Middleware or layout protection

- [ ] **Step 1: Replace old password auth with real user + role check**

In admin APIs: `const user = await getCurrentUser(); if (!['moderator','admin'].includes(user.role)) ...`

- [ ] **Step 2: Moderators see limited actions** (approve/ban only, no delete, no user management)

- [ ] **Step 3: Update login form** to use Telegram widget instead of password

- [ ] **Step 4: Add "Users" tab in admin for admins** (list users, change roles) — minimal

- [ ] **Step 5: Commit**

---

## Task 8: Backfill & Data Migration Scripts

**Files:**
- `next/scripts/backfill-user-ids.ts`
- `next/scripts/refresh-subscriber-status.ts`

- [ ] **Step 1: Script to backfill `submitted_by_user_id`** for existing scrans by matching `telegram_id`

- [ ] **Step 2: Script to refresh subscriber status** for all linked users (can be run via make or cron)

- [ ] **Step 3: Add to Makefile**

```makefile
backfill-users:
	docker compose exec next bun run scripts/backfill-user-ids.ts
```

- [ ] **Step 4: Document in README**

- [ ] **Step 5: Commit**

---

## Task 9: Polish, Error Handling, Security

- Add proper error pages for linking failures
- Rate limit internal endpoints
- Add logging for linking and subscriber checks
- Validate that anonymous plays still work end-to-end
- Update AGENTS.md and bot/README.md with new flow

- [ ] Multiple small commits

---

## Task 10: Testing & Verification

- Unit tests for queue logic, auth verification, svaga client
- Integration: play anonymously + as logged-in user
- Bot suggestion with and without SVAGA+ link
- Moderator vs Admin permissions in UI
- Manual test of hybrid queue ordering

- [ ] Run full test suite + manual checks before final commit

---

**Final commit message example:**
```
feat: implement user accounts, optional SVAGA+ linking, RBAC and fair moderation queue

- Telegram auth + local users
- SVAGA+ subscriber status snapshots
- Hybrid queue (score + 3:1 interleaving)
- Bot now reports subscriber status on suggestions
- Profile with history
```

---

**Plan complete.** Ready for execution.

Two options:
1. **Subagent-Driven (recommended)** — I dispatch fresh subagents per task with reviews.
2. **Inline** — we execute tasks here with checkpoints.

Which one do you prefer? Or shall we start with the most critical piece (DB + auth + linking)?