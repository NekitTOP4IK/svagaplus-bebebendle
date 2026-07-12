#!/usr/bin/env bun
/**
 * Refresh script for subscriber status on all linked users.
 *
 * Iterates over users that have been linked to SVAGA+ (via svaga_user_id or linked_at)
 * and re-fetches current status from SVAGA+ internal API, updating:
 *   - is_subscriber
 *   - svaga_user_id / svaga_telegram_user_id
 *   - last_synced_at
 *
 * Does NOT modify linked_at (preserves original link time).
 *
 * Intended to be run periodically (via make or cron) to keep cached status fresh.
 * Safe to run anytime.
 *
 * Run via: bun run scripts/refresh-subscriber-status.ts
 */

import { db, users } from "../db/schema";
import { eq, isNotNull, or } from "drizzle-orm";
import { getSubscriberStatus } from "../lib/svaga";

async function refreshAllLinkedSubscriberStatuses() {
  console.log("🔄 Starting subscriber status refresh for linked users...\n");

  // "Linked users": have either a tribute svaga_user_id or a linked_at timestamp recorded
  const linkedUsers = await db
    .select({
      id: users.id,
      telegramId: users.telegramId,
      telegramUsername: users.telegramUsername,
      svagaUserId: users.svagaUserId,
      isSubscriber: users.isSubscriber,
      lastSyncedAt: users.lastSyncedAt,
      linkedAt: users.linkedAt,
    })
    .from(users)
    .where(
      or(
        isNotNull(users.svagaUserId),
        isNotNull(users.linkedAt)
      )
    )
    .orderBy(users.id);

  console.log(`📋 Found ${linkedUsers.length} linked user(s) to refresh`);

  if (linkedUsers.length === 0) {
    console.log("✅ No linked users. Nothing to refresh.");
    process.exit(0);
  }

  let refreshed = 0;
  let setToFalse = 0;
  let failed = 0;
  const now = new Date();

  for (let i = 0; i < linkedUsers.length; i++) {
    const u = linkedUsers[i];
    const display = u.telegramUsername || `tg:${u.telegramId}`;

    try {
      const status = await getSubscriberStatus(u.telegramId);

      if (!status.success) {
        failed++;
        console.log(`  [${i+1}/${linkedUsers.length}] ${display}: refresh failed, keeping previous`);
        continue;
      }

      const hasTribute = !!status.tributeUserId;

      await db
        .update(users)
        .set({
          svagaTelegramUserId: hasTribute ? u.telegramId : null,
          svagaUserId: status.tributeUserId ?? null,
          isSubscriber: status.isSubscriber,
          lastSyncedAt: now,
          updatedAt: now,
          // linkedAt intentionally left untouched
        })
        .where(eq(users.id, u.id));

      refreshed++;
      if (!status.isSubscriber && u.isSubscriber) {
        setToFalse++;
      }

      const statusStr = status.isSubscriber ? "SUBSCRIBER" : "not-subscriber";
      const tributeStr = status.tributeUserId ? ` (tribute:${status.tributeUserId})` : "";
      console.log(`✓ [${i + 1}/${linkedUsers.length}] ${display}: ${statusStr}${tributeStr}`);

      // Small delay to avoid hammering SVAGA+ if many users
      if (i < linkedUsers.length - 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    } catch (error) {
      failed++;
      console.error(`❌ [${i + 1}/${linkedUsers.length}] Failed refresh for ${display}:`, error);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Refresh Summary");
  console.log("=".repeat(50));
  console.log(`Total linked users   : ${linkedUsers.length}`);
  console.log(`✅ Refreshed         : ${refreshed}`);
  console.log(`⬇️  Downgraded (now false) : ${setToFalse}`);
  console.log(`❌ Failed            : ${failed}`);
  console.log("=".repeat(50));

  const exitCode = failed > 0 ? 1 : 0;
  if (exitCode === 0) {
    console.log("\n✅ Subscriber status refresh completed successfully!");
  } else {
    console.log("\n⚠️  Refresh completed with some failures");
  }

  process.exit(exitCode);
}

refreshAllLinkedSubscriberStatuses().catch((error) => {
  console.error("\n💥 Fatal error during refresh:", error);
  process.exit(1);
});
