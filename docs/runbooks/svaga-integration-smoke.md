# SVAGA+ Integration Staging Smoke Runbook

Use environment variables only — never paste live secrets into tickets or chat logs.

## Prerequisites

| Variable | Meaning |
|----------|---------|
| `SVAGAPLUS_URL` | Staging SVAGA+ base URL (e.g. `https://svaga-staging.example`) |
| `SVAGAPLUS_INTERNAL_SECRET` | Staging `BEBEBENDLE_INTERNAL_SECRET` on SVAGA+ / `SVAGAPLUS_INTERNAL_SECRET` on Bebebendle |
| `BEBEBENDLE_URL` | Staging Bebebendle base URL |
| `SVAGA_TARGET_USER_ID` | Staging Olesha `users.id` on SVAGA+ |

Create four staging-only Telegram IDs / fixtures and record **only** those IDs:

1. **Active Olesha subscriber** — active, not banned `TributeSubscription` for `SVAGA_TARGET_USER_ID`
2. **Inactive Olesha subscriber** — `is_active=false` (or expired) for the same target
3. **Other-owner subscriber** — active subscription for a different SVAGA+ owner
4. **Unknown Telegram ID** — no subscription rows

## Direct SVAGA+ endpoint

```bash
curl -fsS -X POST "$SVAGAPLUS_URL/api/internal/bebebendle/subscription-status" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SVAGAPLUS_INTERNAL_SECRET" \
  --data '{"contract_version":1,"telegram_user_id":123456789}'
```

Expected matrix:

| Fixture | `is_subscriber` |
|---------|-----------------|
| Active Olesha | `true` |
| Inactive Olesha | `false` |
| Other-owner | `false` |
| Unknown ID | `false` |

Negative checks:

```bash
# Missing secret -> 401
curl -sS -o /tmp/svaga-401.json -w "%{http_code}" -X POST \
  "$SVAGAPLUS_URL/api/internal/bebebendle/subscription-status" \
  -H "Content-Type: application/json" \
  --data '{"contract_version":1,"telegram_user_id":123456789}'
# expect 401

# Bad payload -> 400
curl -sS -o /tmp/svaga-400.json -w "%{http_code}" -X POST \
  "$SVAGAPLUS_URL/api/internal/bebebendle/subscription-status" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SVAGAPLUS_INTERNAL_SECRET" \
  --data '{"contract_version":1,"telegram_user_id":true}'
# expect 400
```

## Bebebendle readiness

```bash
curl -fsS "$BEBEBENDLE_URL/api/health/ready" || curl -fsS "$BEBEBENDLE_URL/api/health" || true
```

If `/api/health/ready` is not yet deployed, verify Next process health and a public HTTPS page load instead.

## Rollout order

1. Deploy the SVAGA+ Task 1 endpoint with `SVAGA_TARGET_USER_ID` and `BEBEBENDLE_INTERNAL_SECRET`.
2. Verify the four fixtures against SVAGA+ directly (table above).
3. Deploy Bebebendle Tasks 2–11 (schema, sessions, SVAGA client, bot, profile).
4. Log in once via Telegram on `/profile` or admin — legacy raw `bebebendle_session` cookies are intentionally rejected.
5. Verify:
   - access cookie expires after ~60 minutes / refresh rotates cookies
   - logout clears access + refresh + legacy cookies
   - profile «Проверить подписку» returns confirmed subscriber/non-subscriber or unknown
   - bot submission stores nullable snapshot; moderators see `SVAGA+` / `Не проверено`
6. Point `SVAGAPLUS_INTERNAL_URL` at an unused local port, restart Bebebendle, confirm stale/unknown (never invented `false`), then restore the URL immediately.

## Bot internal contract (from bot host)

```bash
curl -fsS \
  -H "X-Internal-Secret: $BEBEBENDLE_INTERNAL_SECRET" \
  "$BEBEBENDLE_URL/api/internal/svaga/subscription-status?telegram_id=123456789"
```

Expect JSON with `isSubscriber`, `source` (`fresh|cache|stale_cache|unknown`), `checkedAt`, and optional `error`.

## Final repository checks

```bash
git status --short
git diff --check
git log --oneline -12
git -C '/mnt/data/dev/Other projects/SvagaPlus Server' status --short
git -C '/mnt/data/dev/Other projects/SvagaPlus Server' diff --check
git -C '/mnt/data/dev/Other projects/SvagaPlus Server' log --oneline -5
```

## Sign-off

- [ ] SVAGA+ four fixtures verified
- [ ] Bebebendle login + refresh + logout verified
- [ ] Profile subscription check truthful
- [ ] Bot null snapshot on outage verified
- [ ] Staging smoke executed once successfully
