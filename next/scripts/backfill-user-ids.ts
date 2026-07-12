#!/usr/bin/env bun
/**
 * Backfill script for submitted_by_user_id on existing scrans.
 *
 * Matches scrans.telegram_id (text) against users.telegram_id (bigint)
 * and sets submitted_by_user_id where it is currently NULL.
 *
 * Safe to run multiple times (idempotent).
 * Run via: bun run scripts/backfill-user-ids.ts  (or via make backfill-users in Docker)
 */

import { db, scrans, users } from "../db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

async function backfillSubmittedByUserId() {
  console.log("🔄 Starting backfill of submitted_by_user_id for scrans...\n");

  // Select candidates: scrans that have a telegram_id but no submitted_by_user_id yet
  const candidates = await db
    .select({
      id: scrans.id,
      telegramId: scrans.telegramId,
    })
    .from(scrans)
    .where(
      and(
        isNull(scrans.submittedByUserId),
        isNotNull(scrans.telegramId)
      )
    )
    .orderBy(scrans.id);

  console.log(`📋 Found ${candidates.length} scrans needing backfill (telegram_id present, submitted_by_user_id NULL)`);

  if (candidates.length === 0) {
    console.log("✅ Nothing to backfill. Done.");
    process.exit(0);
  }

  let backfilled = 0;
  let noMatch = 0;
  let parseErrors = 0;
  let dbErrors = 0;

  for (const candidate of candidates) {
    const tgStr = candidate.telegramId;
    if (!tgStr) {
      noMatch++;
      continue;
    }

    const tgNum = parseInt(tgStr, 10);
    if (isNaN(tgNum) || tgNum <= 0) {
      parseErrors++;
      console.warn(`⚠️  Invalid telegram_id on scran ${candidate.id}: "${tgStr}"`);
      continue;
    }

    try {
      // Match by numeric telegram id
      const matchingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.telegramId, tgNum))
        .limit(1);

      if (matchingUser.length === 0) {
        noMatch++;
        continue;
      }

      const userId = matchingUser[0].id;

      await db
        .update(scrans)
        .set({
          submittedByUserId: userId,
        })
        .where(eq(scrans.id, candidate.id));

      backfilled++;

      if (backfilled % 100 === 0) {
        console.log(`  ✓ Progress: ${backfilled} backfilled...`);
      }
    } catch (error) {
      dbErrors++;
      console.error(`❌ DB error backfilling scran ${candidate.id}:`, error);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Backfill Summary");
  console.log("=".repeat(50));
  console.log(`Candidates processed : ${candidates.length}`);
  console.log(`✅ Backfilled         : ${backfilled}`);
  console.log(`⏭️  No matching user   : ${noMatch}`);
  console.log(`⚠️  Parse/invalid tg   : ${parseErrors}`);
  console.log(`❌ DB errors           : ${dbErrors}`);
  console.log("=".repeat(50));

  const exitCode = dbErrors > 0 ? 1 : 0;
  if (exitCode === 0) {
    console.log("\n✅ Backfill completed successfully!");
  } else {
    console.log("\n⚠️  Backfill completed with errors");
  }

  process.exit(exitCode);
}

backfillSubmittedByUserId().catch((error) => {
  console.error("\n💥 Fatal error during backfill:", error);
  process.exit(1);
});
