# Bebebendle: SVAGA+ Account Linking, Authentication, Roles, and Moderation Queue

**Date:** 2026-07-12  
**Status:** Design (approved direction)  
**Author:** Grok + User  
**Related:** Account linking with svagaplus-server, proper RBAC, hybrid moderation queue, optional subscriber perks.

## 1. Goals & Non-Goals

### Goals
- Introduce proper user accounts in bebebendle using **Telegram as primary identity**.
- Make registration **optional** — anonymous play must remain fully available.
- Allow users to optionally link their Telegram to their SVAGA+ account.
- Give **moderators** a fair queue that respects subscribers without letting them dominate.
- Provide convenience for logged-in users (history of suggestions and daily plays).
- Create a solid foundation for future perks (subscriber marks, anti-abuse improvements, etc.).
- Keep the two systems loosely coupled (bebebendle and svagaplus-server communicate via internal APIs).

### Non-Goals (for v1)
- Full SSO / shared sessions between the two projects.
- Real-time webhooks for subscription changes (future work).
- Complex trust/weighting system for the average score (currently every play counts; accounts mainly improve replay protection and UX).
- Paid subscriber visual mark in the daily game (data fields only for now).

## 2. Current State (Summary)

- No real users table. Game uses `fingerprint_hash` + `session_id` + cookies.
- Admin access is a single shared `ADMIN_PASSWORD` (Bearer token).
- All scrans and results are tied only to `telegram_id` (from bot) or anonymous session.
- Moderation queue is simple `ORDER BY id`.
- No notion of "subscriber" or verified player.

## 3. Core Decisions

- **Primary identity**: Telegram (`telegram_id` / `telegram_user_id` as bigint).
- **Local users**: bebebendle has its own `users` table (per-project users are acceptable).
- **SVAGA+ linking**: Optional, by `telegram_user_id` bridge + storage of `tribute_user_id`.
- **Subscriber perks (v1)**:
  - Priority in moderation queue (hybrid fairness logic).
  - `is_subscriber_at_submit` snapshot on scrans (for future marks).
- **Bot gets subscription status** via bebebendle backend (Variant 1 chosen).
- **Anonymous play**: Always allowed. Accounts mainly give:
  - Personal history.
  - Stronger replay protection.
  - Future foundation.

## 4. Data Model

### New Table: `users`

```sql
CREATE TABLE users (
    id                  SERIAL PRIMARY KEY,
    telegram_id         BIGINT UNIQUE NOT NULL,
    telegram_username   TEXT,
    display_name        TEXT,
    role                TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','moderator','admin')),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now()
);
```

### SVAGA+ Linking

Option A (recommended for start): add columns to `users`  
Option B: separate `svaga_links` table (more future-proof).

Proposed (simple start, easy to split later):

```sql
ALTER TABLE users ADD COLUMN svaga_telegram_user_id BIGINT;
ALTER TABLE users ADD COLUMN svaga_user_id        TEXT;      -- tribute_user_id (svagaplus internal)
ALTER TABLE users ADD COLUMN is_subscriber        BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN last_synced_at       TIMESTAMP;
ALTER TABLE users ADD COLUMN linked_at            TIMESTAMP;
```

Unique constraint on `svaga_telegram_user_id` when present.

### Changes to `scrans`

```sql
ALTER TABLE scrans ADD COLUMN submitted_by_user_id   INTEGER REFERENCES users(id);
ALTER TABLE scrans ADD COLUMN is_subscriber_at_submit BOOLEAN DEFAULT false;
ALTER TABLE scrans ADD COLUMN subscriber_checked_at  TIMESTAMP;
```

### Changes to `daily_user_results`

```sql
ALTER TABLE daily_user_results ADD COLUMN user_id INTEGER REFERENCES users(id);
```

Keep `session_id` and `fingerprint_hash` for anonymous plays and fallback.

### Indexes (important)

- `users(telegram_id)`
- `scrans(submitted_by_user_id)`
- `scrans(is_subscriber_at_submit)`
- `daily_user_results(user_id, date)` (for uniqueness + history)

## 5. Authentication Flow (Site)

1. User visits bebebendle site.
2. Clicks "Login with Telegram" (official Telegram Login Widget).
3. Next.js receives data + hash, verifies signature using `BOT_TOKEN`.
4. Upsert `users` record by `telegram_id`.
5. Issue session (secure httpOnly cookie or JWT with user id + role).
6. User is now "logged in" as a local bebebendle user.

Roles are checked server-side on admin APIs and profile routes.

## 6. SVAGA+ Linking Flow

### On the Website

1. Logged-in user clicks "Привязать SVAGA+ / Проверить подписку".
2. Frontend calls `POST /api/svaga/link`.
3. Backend (authenticated) calls svagaplus-server internal endpoint (protected by shared secret):
   ```
   POST /internal/bebebendle/get-status
   { "telegram_user_id": 123456789 }
   ```
4. SVAGA+ looks up `LinkedAccount` + active subscriptions and returns current status + `tribute_user_id`.
5. Bebebendle stores the data and sets `is_subscriber`, `last_synced_at`, `svaga_user_id`.

### Refreshing Status

- On-demand (when checking for queue or suggestion).
- Background job (daily) for all linked users.
- Manual "Refresh status" button in profile.

## 7. Impact on Bot & New Scran Suggestions

Chosen approach: **Variant 1** — Bot asks bebebendle backend.

### Flow when user suggests via bot

1. User goes through `/suggest` wizard in "овсянка" bot.
2. On confirmation step (before `insert_scran`):
   ```python
   is_subscriber = await bebebendle_client.get_svaga_subscriber_status(telegram_id)
   ```
3. Bebebendle internal endpoint (`/api/internal/svaga/subscription-status`):
   - Looks up local link.
   - If stale → calls svagaplus internal API to refresh.
   - Returns `is_subscriber`.
4. Bot calls updated `insert_scran(..., telegram_id=..., is_subscriber=is_subscriber)`.
5. Scran is saved with `is_subscriber_at_submit` and (if possible) `submitted_by_user_id`.

If the user has never logged into the site, `submitted_by_user_id` can stay NULL. Later backfill is possible by `telegram_id`.

### Internal Endpoint for Bot (protected)

- Path: `/api/internal/svaga/subscription-status`
- Auth: `X-Internal-Secret` header (shared secret, like BOT_SECRET in svagaplus).
- Rate limited.
- Returns fresh or cached status.

## 8. Moderation Queue (Hybrid)

### Queue Score Formula (base)

```ts
queue_score =
  (is_subscriber_at_submit ? 1200 : 0) +
  (waiting_hours * 8) -
  (Math.min(pending_count - 1, 6) * 35);
```

### Interleaving (Fairness)

When building the list for the "queue" view:
- Take up to 3 subscriber scrans.
- Then take 1 regular scran (if available).
- Repeat.

This guarantees regular submissions are not completely buried.

### Additional Rules

- Hard cap: max **6** pending scrans per user.
- Show in UI: `(X на модерации)` next to author.
- Simple filter: "Только подписчики" (no separate tabs).
- Aging helps long-waiting regular scrans rise.

### Implementation Note

Because of custom ordering + interleaving, the admin "queue" view should fetch a reasonable window (e.g. 150-200 pending) and reorder in application code rather than pure SQL `OFFSET/LIMIT`.

## 9. Player Profile & History

After login the user can see:

- List of all their submitted scrans + current status (approved / pending).
- History of daily plays:
  - Date
  - Score
  - (Optionally) which rounds were correct
- Link status with SVAGA+ + current cached subscriber flag + "Refresh" button.

## 10. Anti-Abuse Improvements

For **everyone** (anonymous + logged-in):
- Enhanced fingerprint (current canvas + IP + User-Agent + other available signals).
- Stronger rate limiting.

For **logged-in users**:
- Uniqueness constraint: one result per `(user_id, date)`.
- Still allow anonymous play (with weaker fingerprint protection).

No automatic trust weighting in averages for v1.

## 11. Migration & Backfill

- Add new columns (nullable where appropriate).
- On first login of an existing `telegram_id` → backfill `submitted_by_user_id` for their old scrans.
- When linking for the first time → set `is_subscriber_at_submit` for recent pending scrans if desired (or leave as historical data).

## 12. Internal APIs (Summary)

**Bebebendle → SVAGA+ (protected)**
- Get subscriber status + tribute_user_id by `telegram_user_id`.

**Bot → Bebebendle (protected by internal secret)**
- `GET /api/internal/svaga/subscription-status?telegram_id=...`

**Website → Bebebendle**
- Link / unlink flow
- Profile data
- Admin moderation queue

## 13. Open / Future Items

- Webhook from SVAGA+ on subscription change.
- Visual "paid subscriber" mark on scrans in daily game (data fields already prepared).
- More advanced anti-abuse / trust scoring for averages.
- Unified profile across projects (later).
- Separate staging/production branches (as discussed earlier).

## 14. Risks & Mitigations

- SVAGA+ downtime → use cached status (graceful degradation).
- Telegram ID collision/mismatch → always treat as string/bigint carefully and verify on linking.
- Queue gaming by subscribers → hard cap + flood penalty + interleaving.

---

**This design is ready for implementation planning.**

Next steps (when approved):
- Write detailed implementation plan (using `writing-plans` skill).
- Create migration + new tables.
- Implement auth + profile.
- Update bot suggestion flow.
- Build hybrid moderation queue in admin panel.