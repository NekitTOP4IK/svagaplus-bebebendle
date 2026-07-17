## Summary

The changes implement the core of the "Bebebendle User Accounts, SVAGA+ Linking, Roles & Moderation Queue" plan: local `users` table keyed by Telegram ID, optional SVAGA+ linking via protected internal calls (with caching + snapshots), Telegram Login Widget auth + httpOnly sessions replacing password, RBAC (player/moderator/admin) protecting admin + profile, hybrid moderation queue (subscriber bonus + aging score + 3:1 interleaving + pending count penalty + UI badges), bot updates to snapshot `is_subscriber_at_submit` + `submitted_by_user_id` at suggestion time, profile + history pages, backfill/refresh scripts, rate limiting on internal paths, and associated tests/docs updates.

The implementation is largely correct and adheres to the design spec and plan for auth flow, subscriber snapshotting, queue logic, anonymous independence (daily uses only session/fingerprint; no getCurrentUser), and logging. Dominant risk areas are: (1) lack of hard enforcement for the 6-pending cap at insert time, (2) link/cache state being cleared on SVAGA+ transient failures (violates "use cached" graceful degradation), (3) `userId` on `daily_user_results` is never populated (making history merge and design uniqueness incomplete), and (4) full pending table scans + proxy age calculations. Security/auth boundaries and bot integration are solid. Anonymous play paths remain untouched and independent as required. Several nits around dead/duplicate code, naming, and data model mismatches.

## Issues

### Issue 1 -- Severity: bug
- File: bot/src/database.py:105
- Description: The max-6-pending-per-author hard cap is never enforced at suggestion insert time (or any web path). `canUserSubmitMore` is defined and tested in `moderation-queue.ts` and surfaced only as a warning badge in the queue UI (`scran-row.tsx:65`). Per plan Task 5 and design §8, enforcement must happen in the insert path (bot) before `insert_scran` and in admin scrans API.
- Suggestion: In `process_confirmation` (and `insert_scran`), count pending by author key (preferring user id or telegram_id), call `canUserSubmitMore`, and reject/return error if >=6. Also gate in the internal status or a new endpoint if needed. Update bot to surface the limit error to user.
- Status: open

### Issue 2 -- Severity: bug
- File: next/app/api/svaga/link/route.ts:39
- Description: On SVAGA+ call failure (or when `getSubscriberStatus` returns no `tributeUserId`), `hasLink=false` forces `linkedAt: current?.linkedAt ?? null` (i.e. clears it) and sets `svaga*` fields to null while still succeeding the POST. Transient outages or "not linked" responses from upstream will unlink the user. Same pattern exists in the internal endpoint's refresh path.
- Suggestion: Distinguish "fetch failed" vs "fetched but not linked". On error or !ok from svaga, preserve existing `svagaUserId`/`linkedAt`/`isSubscriber` (only update `lastSyncedAt` perhaps with a failure marker). Only clear link fields on explicit unlink (future) or confirmed response that the account is no longer linked on svaga side. Update `getSubscriberStatus` to return a success/failure indicator.
- Status: open

### Issue 3 -- Severity: bug
- File: next/app/api/internal/svaga/subscription-status/route.ts:79
- Description: Same overwriting behavior as Issue 2: stale refresh or first-seen path does `svagaTelegramUserId: tributeUserId ? ... : null` + `svagaUserId: ... ?? null` unconditionally after calling `getSubscriberStatus`. A failed upstream fetch during a bot suggestion (or queue view) will null out a previously-linked user's subscriber/link data. This contradicts design §14 "SVAGA+ downtime → use cached status".
- Suggestion: On fetch failure in the internal handler, return/use the previous cached value (if any) without clearing link fields. Only perform the update if the fresh call succeeded. Consider a separate "force refresh" that can fail visibly.
- Status: open

### Issue 4 -- Severity: bug
- File: next/app/api/daily/results/route.ts:64 (and next/app/actions/daily.ts:129)
- Description: Inserts into `daily_user_results` never include `userId` (even when a `getCurrentUser()` is available). The field was added per design §4 and plan, and profile history queries it (`/api/user/history/route.ts:26`), but the column stays NULL. History for logged-in users only works via the `scrandle_session` cookie merge. Uniqueness constraint is only on `(sessionId, date)`.
- Suggestion: In both result submission paths, if a logged-in user exists, pass `userId: user.id` on insert (and keep sessionId for anonymous cross-device fallback). Consider adding a (userId, date) unique index/constraint (or composite) as noted in design. Update history query/docs if needed. Also populate in the client-side daily result flows if they call server actions.
- Status: open

### Issue 5 -- Severity: bug
- File: next/db/schema.ts:90 (and next/db/migrations/0004_add_users_and_svaga_linking.sql:26)
- Description: The `uniqueResultPerDay` index is defined only on `(sessionId, date)`. Design explicitly calls for `daily_user_results(user_id, date)` uniqueness + indexes. Migration only does `ADD COLUMN` without a REFERENCES or a `(user_id, date)` unique. This leaves logged-in uniqueness and history integrity incomplete.
- Suggestion: Add a second unique index `uniqueResultPerUserPerDay` on `(userId, date)` (allowing NULL userId for pure anonymous). Update migration + run `make generate-migration` or manual follow-up. Make the check in result submission also consider userId when present.
- Status: open

### Issue 6 -- Severity: suggestion
- File: next/app/api/admin/scrans/route.ts:35 (queue mode) and :144 (list mode)
- Description: Queue view does `SELECT * FROM pending` (all rows) + JS reorder + slice for pagination (per design note allowing ~150-200). List view does full `SELECT` just for `total`. No LIMIT/OFFSET in SQL for queue. For high pending volume this loads everything into memory on every page request.
- Suggestion: For queue, fetch a bounded window (e.g. ORDER BY id LIMIT 200) or use keyset pagination on the final interleaved list. For list totals, use `COUNT(*)` or maintain a counter. Document the assumption that pending volume stays modest.
- Status: open

### Issue 7 -- Severity: suggestion
- File: next/app/api/admin/scrans/[id]/approve/route.ts:1 (entire file) + duplication with next/app/admin/actions.ts:14
- Description: The dedicated approve route exists and was edited in the diff, but is never called from `useScranMutations`, dashboard, or hooks (which use the server action). The action also does Telegram notification; the route does not. Ban route is used. This is dead/duplicate code.
- Suggestion: Remove the unused `[id]/approve/route.ts` (or wire it consistently and remove duplication). Ensure all paths have identical side effects (notification, audit).
- Status: open

### Issue 8 -- Severity: nit
- File: next/components/admin/scran-row.tsx:116 (and use-scran-mutations.ts:51)
- Description: The "Ban" button (shown for approved scrans, callable by moderators) calls the ban route which does `UPDATE approved=false` (re-pends the item). "Delete" (admin only) is the destructive remove+notify. Naming is inconsistent with typical "ban" semantics and with the delete flow.
- Suggestion: Rename button/action to "Unapprove" / "Return to queue" or clarify in UI. Keep "Ban" terminology only for the destructive path if intended. Update tooltips and toasts.
- Status: open

### Issue 9 -- Severity: nit
- File: next/lib/auth-server.ts:22 and next/db/schema.ts:31
- Description: `telegramId` uses `bigint(..., { mode: "number" })` + `parseInt` everywhere. Telegram IDs are currently small enough for Number, but this is lossy for IDs > 2^53 (future-proofing). Session cookie stores the decimal string.
- Suggestion: Consider `mode: "string"` (or BigInt) for telegram ids in users/scrans for safety, with corresponding parse adjustments and tests. Update backfill and bot lookup accordingly.
- Status: open

### Issue 10 -- Severity: suggestion
- File: next/app/api/internal/svaga/subscription-status/route.ts:25 (and link/route.ts:18)
- Description: Rate limiting (and the internal endpoint) relies on Redis via `checkRateLimit`; on any Redis error it fails open (`allowed: true`). This weakens the 30/60s and 5/60 protections intended to mitigate abuse of SVAGA+ checks and linking.
- Suggestion: Fail closed (or use a local in-memory fallback with warning) for sensitive internal paths, or ensure Redis is always available in the deployment. Add metrics on rate-limit bypasses.
- Status: open

### Issue 11 -- Severity: nit
- File: next/db/schema.ts:90 (index name) + dailyUserResults definition
- Description: The unique index is named `unique_user_result_per_day` but is defined on `(sessionId, date)`. Comment and design refer to user-based uniqueness. Minor but confusing.
- Suggestion: Rename the index to `unique_session_result_per_day` (and add the proper user one from Issue 5).
- Status: open

### Issue 12 -- Severity: suggestion
- File: next/app/api/user/profile/route.ts:22
- Description: User's own scrans are fetched only via `WHERE submittedByUserId = ?`. Bot suggestions after the feature (which create minimal users and attach the id) will appear, but any pre-migration historical scrans require the backfill script to be visible in profile. No fallback to `telegramId` match is present (unlike the admin queue).
- Suggestion: Either always run a lightweight per-user backfill on first profile load for that user's telegramId, or change the query to `WHERE submittedByUserId = ? OR (telegramId = ? AND submittedByUserId IS NULL)`. Document that `make backfill-users` is required for old data.
- Status: open

### Issue 13 -- Severity: nit
- File: next/app/profile/page.tsx:52 (error message) + login-form.tsx
- Description: Profile tells users "Войдите через Telegram (используйте /admin для логина)". The widget is only rendered inside the admin login form. This is by design ("for now") but the UX is indirect.
- Suggestion: Consider extracting a shared Telegram login component or a minimal login landing that can be linked from profile when 401. Or add a note in AGENTS/README about the current flow.
- Status: open

### Issue 14 -- Severity: suggestion
- File: bot/src/main.py:530 and database.py:90 (insert path)
- Description: No pending count check or cap enforcement before calling `insert_scran` + `get_svaga_subscriber_status`. The subscriber snapshot always happens even if the user would exceed the cap.
- Suggestion: Add the count query + `canUserSubmitMore` guard (using the same author key logic) before the status fetch and insert. Return a clear error to the Telegram user ("You have too many pending suggestions").
- Status: open

### Issue 15 -- Severity: nit
- File: next/app/api/admin/scrans/route.ts:78 (and moderation-queue.ts:74)
- Description: Age proxy `hoursWaiting = Math.max(0, (maxId - p.id) / 80)` assumes dense sequential IDs and uses arbitrary divisor. Deletes (which the admin can do) create gaps and distort relative ages. No `created_at` column on scrans.
- Suggestion: Add `createdAt` to scrans (and migration) for accurate waiting time. Fall back to ID only for legacy rows.
- Status: open

