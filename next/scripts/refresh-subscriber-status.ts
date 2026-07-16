#!/usr/bin/env bun
/**
 * Refresh cached subscriber status for all users with a prior successful check.
 * Only writes confirmed values on upstream success; failures update attempt/error only.
 */

import { db, users } from "../db/schema";
import { isNotNull } from "drizzle-orm";
import { getSubscriberStatus } from "../lib/svaga";
import { userSvagaRepository } from "../lib/svaga-status-service";

async function refreshAllSubscriberStatuses() {
  console.log("🔄 Starting subscriber status refresh...\n");

  const candidates = await db
    .select({
      id: users.id,
      telegramId: users.telegramId,
      telegramUsername: users.telegramUsername,
      isSubscriber: users.isSubscriber,
      lastSyncedAt: users.lastSyncedAt,
    })
    .from(users)
    .where(isNotNull(users.lastSyncedAt))
    .orderBy(users.id);

  console.log(`📋 Found ${candidates.length} user(s) with prior successful checks`);

  if (candidates.length === 0) {
    console.log("✅ Nothing to refresh.");
    process.exit(0);
  }

  let refreshed = 0;
  let failed = 0;
  const now = new Date();

  for (let i = 0; i < candidates.length; i++) {
    const u = candidates[i];
    const display = u.telegramUsername || `tg:${u.telegramId}`;

    try {
      const status = await getSubscriberStatus(u.telegramId);

      if (status.status !== "ok") {
        failed++;
        await userSvagaRepository.saveFailure(u.telegramId, status.reason, now);
        console.log(`  [${i + 1}/${candidates.length}] ${display}: ${status.reason}, preserving cache`);
        continue;
      }

      await userSvagaRepository.saveSuccess(
        u.telegramId,
        status.isSubscriber,
        status.checkedAt,
      );
      refreshed++;
      const statusStr = status.isSubscriber ? "SUBSCRIBER" : "not-subscriber";
      console.log(`✓ [${i + 1}/${candidates.length}] ${display}: ${statusStr}`);

      if (i < candidates.length - 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    } catch (error) {
      failed++;
      console.error(`❌ [${i + 1}/${candidates.length}] Failed refresh for ${display}:`, error);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Total candidates : ${candidates.length}`);
  console.log(`✅ Refreshed     : ${refreshed}`);
  console.log(`❌ Failed        : ${failed}`);
  console.log("=".repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

refreshAllSubscriberStatuses().catch((error) => {
  console.error("\n💥 Fatal error during refresh:", error);
  process.exit(1);
});
