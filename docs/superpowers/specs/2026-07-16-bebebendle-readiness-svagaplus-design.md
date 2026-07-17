# Bebebendle Readiness and SVAGA+ Integration Design

**Date:** 2026-07-16

**Status:** Approved

## 1. Goals

This design makes Bebebendle safe and reproducible in development, staging, and production while completing the first real integration with SVAGA+.

The work has two independently executable tracks:

1. Fix authentication, subscription status, failure semantics, tests, and the user-facing SVAGA+ flow.
2. Add CI and release-based SSH deployment for PM2 hosts without Docker.

The first SVAGA+ integration is intentionally narrow. It exposes subscription status through a dedicated internal API namespace that can later grow into a broader admin integration without sharing databases or Telegram bot credentials.

## 2. Non-Goals

- A unified Bebebendle/SVAGA+ account system.
- Direct Bebebendle access to the SVAGA+ database.
- A general SVAGA+ admin API in this delivery.
- Kubernetes or Docker-based application deployment.
- Webhook-driven subscription cache invalidation. The first version uses on-demand refresh and a scheduled refresh script.
- Migrating user uploads to object storage. Staging and production keep uploads in a shared host directory with backup coverage.

## 3. Repository Boundaries

### Bebebendle

Repository: `/mnt/data/dev/Other projects/svagaplus-bebebendle`

Responsibilities:

- Telegram authentication and local sessions.
- Local users and roles.
- Cached SVAGA+ subscription status.
- Bot-facing internal subscription status endpoint.
- Subscriber snapshot on suggestion submission.
- User profile and moderation presentation.
- CI and PM2 deployment workflows for Bebebendle.

### SVAGA+

Repository: `/mnt/data/dev/Other projects/SvagaPlus Server`

Responsibilities:

- Authoritative subscription lookup.
- Scoping the lookup to the configured Olesha/target account.
- Internal caller authentication.
- Returning a stable, versioned response contract.

## 4. Authoritative Subscription Rule

A Telegram user is a subscriber for Bebebendle only when SVAGA+ contains a `TributeSubscription` row satisfying all of these conditions:

- `TributeSubscription.user_id == SVAGA_TARGET_USER_ID`
- `TributeSubscription.telegram_user_id == telegram_user_id`
- `TributeSubscription.is_active is True`
- `TributeSubscription.is_banned is False`

`SVAGA_TARGET_USER_ID` is the SVAGA+ `users.id` value for Olesha. It is required in every environment that enables the integration. The internal endpoint fails configuration validation when the target is missing; it never falls back to "any active subscription".

`LinkedAccount` is not consulted by this endpoint. `telegram_user_id` is not unique on that table, so returning one arbitrary linked account would create an unstable contract. A future full account/admin integration will expose linked accounts as a separate collection resource in the same internal namespace.

## 5. SVAGA+ Internal API

### Namespace

Create a dedicated Flask blueprint registered under:

`/api/internal/bebebendle`

The first endpoint is:

`POST /api/internal/bebebendle/subscription-status`

Future Bebebendle admin endpoints may be added to this blueprint after separate design and authorization review.

### Authentication

- Secret env var on SVAGA+: `BEBEBENDLE_INTERNAL_SECRET`
- Secret env var on Bebebendle: `SVAGAPLUS_INTERNAL_SECRET`
- Header: `X-Internal-Secret`
- Comparison: `hmac.compare_digest`
- Missing server-side secret: return `503 integration_not_configured`
- Missing or incorrect caller secret: return `401 unauthorized`

This secret is not `BOT_SECRET` and must be independently rotatable.

### Request

```json
{
  "contract_version": 1,
  "telegram_user_id": 123456789
}
```

Validation rules:

- JSON object is required.
- `contract_version` must equal `1`.
- `telegram_user_id` must be a positive integer and must not accept booleans.
- Unknown fields are rejected to detect contract drift.

### Success Response

```json
{
  "contract_version": 1,
  "telegram_user_id": 123456789,
  "target_user_id": "svaga-user-uuid",
  "is_subscriber": true,
  "checked_at": "2026-07-16T12:00:00Z"
}
```

`200` is returned for both subscriber and confirmed non-subscriber results.

### Error Response

```json
{
  "contract_version": 1,
  "error": {
    "code": "invalid_request",
    "message": "telegram_user_id must be a positive integer"
  }
}
```

Status mapping:

- `400`: invalid request or unsupported contract version.
- `401`: bad caller secret.
- `503`: integration configuration missing.
- `500`: unexpected database/server error.

No error response is interpreted as a confirmed non-subscriber result.

## 6. Bebebendle SVAGA+ Client and Cache

The client returns a discriminated result rather than a boolean:

```ts
type SvagaCheckResult =
  | {
      status: "ok";
      isSubscriber: boolean;
      checkedAt: Date;
    }
  | {
      status: "unavailable";
      reason: "not_configured" | "timeout" | "unauthorized" | "upstream" | "invalid_response";
    };
```

The client uses a five-second timeout and validates the complete response shape before returning `status: "ok"`.

The local user row stores these independent facts:

- Last confirmed subscriber value: nullable boolean.
- Last successful check time.
- Last attempted check time.
- Last check error code.

Only `status: "ok"` updates the confirmed value and successful check time. A timeout or upstream error updates only attempt/error fields.

The bot-facing endpoint returns one of three states:

- `source: "fresh"`: an upstream check succeeded during the request.
- `source: "cache"`: the successful cache is within its one-hour TTL.
- `source: "stale_cache"`: upstream failed, but a previous confirmed value exists.
- `source: "unknown"`: upstream failed and there is no confirmed value.

`isSubscriber` is `boolean | null`; it is `null` only for `source: "unknown"`.

## 7. Suggestion Snapshot Semantics

Change `scrans.is_subscriber_at_submit` from a defaulted boolean to a nullable boolean:

- `true`: confirmed subscriber at submission.
- `false`: confirmed non-subscriber at submission.
- `null`: status could not be determined.

`subscriber_checked_at` is populated only for confirmed fresh/cache/stale-cache values and remains null for unknown.

The moderation queue grants subscriber priority only for `true`. `false` and `null` receive normal ordering. The admin UI distinguishes `null` as "SVAGA+ не проверено" so the operational failure is visible rather than silently misclassifying the user.

The six-pending-suggestions cap remains enforced before the subscription lookup. Database-level or transactional protection is added so two concurrent confirmations cannot both pass the cap.

## 8. Session Architecture

### Access Token

- Cookie: `bebebendle_access`
- Lifetime: 60 minutes
- Format: versioned HMAC-SHA256-signed payload
- Payload: session ID, Telegram user ID, issued-at, expiry, version
- Secret: `SESSION_SECRET`
- Cookie attributes: `HttpOnly`, `Secure` in staging/production, `SameSite=Lax`, `Path=/`

The raw Telegram ID cookie `bebebendle_session` is not accepted after rollout.

### Refresh Token

- Cookie: `bebebendle_refresh`
- Token: 32 random bytes encoded as base64url
- Database stores only a SHA-256 hash.
- Idle/sliding lifetime: 90 days.
- Absolute family lifetime: 180 days from initial Telegram login.
- Rotation: every successful refresh issues a new refresh token and revokes the previous token.
- Replay detection: use of a rotated/revoked token revokes the entire token family.

### Session Storage

Create a `user_sessions` table with:

- `id` UUID/text primary key.
- `user_id` foreign key.
- `refresh_token_hash` unique text.
- `family_id` UUID/text.
- `created_at`, `last_used_at`, `expires_at`, `absolute_expires_at`.
- `revoked_at`, `replaced_by_session_id`.
- Optional `user_agent_hash` for audit only; it is not an authentication factor.

### Refresh Flow

`POST /api/auth/refresh`:

1. Read refresh cookie.
2. Hash token and lock the matching session row.
3. Reject missing, expired, absolutely expired, or revoked rows.
4. On revoked-token replay, revoke every active row with the same `family_id`.
5. Rotate to a new session row/token in one transaction.
6. Issue a new 60-minute access cookie and a new 90-day refresh cookie capped by the family absolute expiry.

`DELETE /api/auth/session` revokes the current refresh session and clears both cookies.

Role changes are effective on the next request because access validation still loads the user and role from the database. A disabled/deleted user invalidates access immediately.

## 9. User Experience

The profile no longer claims to create an account link. The section is named "Подписка СВАГА+" and provides:

- Confirmed state: subscriber or non-subscriber.
- Unknown state: status could not be checked.
- Freshness/source text: fresh, cached, or stale.
- Last successful check date and time.
- Primary action: "Проверить подписку".
- Success feedback and `role="status"`.
- Error feedback and `role="alert"`.

The profile gets a direct Telegram login surface and a discoverable link from the main UI. Player login is not presented as "Admin Login". Admin authorization remains role-based after login.

When SVAGA+ returns a confirmed non-subscriber, the UI explains that the check is scoped to the configured Olesha subscription. It does not suggest that any SVAGA+ account automatically grants priority.

## 10. Branch and CI Policy

- `dev`: run the complete quality gate; never deploy.
- `staging`: run the same quality gate, then deploy automatically to the staging GitHub Environment and host.
- `main`: run the same quality gate, then deploy to the production GitHub Environment and host after environment approval.

Required gate:

- Frontend frozen dependency install.
- ESLint.
- Vitest.
- Next.js production build.
- Bot Ruff.
- Bot MyPy.
- Bot pytest.
- SVAGA+ internal contract tests when the corresponding server repository change is reviewed.
- Migration smoke test against PostgreSQL.
- Release archive validation.
- Secret scan.

## 11. PM2 Release Deployment

Application containers are not used on staging or production.

Host services:

- PostgreSQL bound to localhost/private interface.
- Redis bound to localhost with authentication where supported by the host configuration.
- Nginx with TLS.
- PM2 managing Next.js and the Python bot.

Filesystem layout:

```text
/opt/bebebendle/
  current -> releases/<sha>
  previous -> releases/<previous-sha>
  releases/<sha>/
  shared/.env
  shared/uploads/
  shared/logs/
  backups/
```

Deploy sequence:

1. CI produces a release archive after all checks pass.
2. CI uploads the archive and deploy script through SSH/SCP or rsync.
3. Server takes an exclusive deploy lock.
4. Server validates required commands, env keys, disk space, and archive checksum.
5. Server extracts `releases/<sha>`.
6. Server symlinks the shared env/uploads/log directories.
7. Server installs frontend and bot dependencies from lockfiles.
8. Server creates a PostgreSQL backup.
9. Server runs Drizzle migrations without `drizzle push`.
10. Server builds or validates the prebuilt frontend release.
11. Server updates `previous`, atomically switches `current`, and reloads PM2.
12. Server checks Next health, bot process health, database connectivity, and a public HTTPS smoke endpoint.
13. On failure, server restores the previous symlink and reloads PM2. Database rollback remains an explicit operator action because destructive down-migrations are not automatic.
14. Server retains the latest five releases and prunes older releases only after successful health checks.

## 12. Health and Operations

Add a Next.js health endpoint with two modes:

- Liveness: process can serve HTTP.
- Readiness: database query succeeds and required integration configuration is present. Redis degradation is reported separately.

The bot exposes health through a small local HTTP listener or a deterministic PM2 process check plus a bot self-check script. The implementation plan will choose the minimal local HTTP endpoint so deploy verification does not rely only on PM2's process state.

Logs remain stdout/stderr for PM2 collection. Integration logs contain request IDs and status/source, but never Telegram names, secrets, tokens, or refresh hashes.

Backups cover PostgreSQL and `shared/uploads`. Restore commands and rollback steps are documented and tested on staging.

## 13. Rollout Order

1. Deploy the SVAGA+ internal endpoint and configure its target/secret.
2. Apply Bebebendle session and subscription schema migrations.
3. Deploy Bebebendle backend with new access/refresh behavior.
4. Deploy the updated bot nullable snapshot behavior.
5. Deploy profile/login UX changes.
6. Run staging contract, session, suggestion, deployment, and rollback smoke tests.
7. Enable the production GitHub Environment and deploy from `main` after approval.

Existing raw-ID sessions are intentionally invalidated. Users sign in once after rollout and then use the access/refresh flow.

## 14. Acceptance Criteria

- A forged Telegram ID cookie cannot authenticate.
- Access tokens expire after 60 minutes.
- Refresh tokens rotate, slide to 90 days, and never exceed the 180-day family lifetime.
- Refresh-token replay revokes the token family.
- Logout revokes the current refresh session and clears both cookies.
- Subscriber status is always scoped to `SVAGA_TARGET_USER_ID`.
- A subscription to another SVAGA+ author does not grant Bebebendle priority.
- SVAGA+ outage never becomes a confirmed `false` result.
- Unknown bot snapshots are stored as null and displayed to moderators.
- The user-facing flow says "check subscription", not "link account".
- Frontend lint, tests, and build pass.
- Bot Ruff, MyPy, and pytest pass.
- `dev` cannot deploy.
- `staging` deploys only after the complete gate.
- `main` deploys only through the production environment and approval.
- Failed staging health checks automatically restore the previous application release.
- Database and uploads restore procedures are verified on staging.
