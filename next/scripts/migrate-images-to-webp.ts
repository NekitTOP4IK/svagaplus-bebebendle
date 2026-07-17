#!/usr/bin/env bun

import { mkdir } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { db, scrans } from "../db/schema";
import { eq } from "drizzle-orm";
import { stat } from "fs/promises";

const SOURCE_DIR = "./public/uploads";
const TARGET_DIR = process.env.UPLOADS_DIR || "/app/uploads";

async function migrateImages() {
  console.log("Starting image migration...");
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Target: ${TARGET_DIR}`);

  await mkdir(TARGET_DIR, { recursive: true });

  const allScrans = await db.select().from(scrans);
  console.log(`Found ${allScrans.length} scrans in database`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const scran of allScrans) {
    if (!scran.imageUrl.startsWith("/uploads/")) {
      console.log(`⏭️  Skipping (not local): ${scran.imageUrl}`);
      skipped++;
      continue;
    }

    const oldFilename = scran.imageUrl.replace("/uploads/", "");
    const sourcePath = join(SOURCE_DIR, oldFilename);

    const baseName = oldFilename.replace(/\.[^.]+$/, "");
    const newFilename = `${baseName}.webp`;
    const targetPath = join(TARGET_DIR, newFilename);

    try {
      try {
        await stat(sourcePath);
      } catch {
        console.log(`⚠️  Source file not found: ${oldFilename}`);
        failed++;
        continue;
      }

      await sharp(sourcePath).webp({ quality: 80 }).toFile(targetPath);

      const newUrl = `/cdn/${newFilename}`;
      await db
        .update(scrans)
        .set({ imageUrl: newUrl })
        .where(eq(scrans.id, scran.id));

      console.log(`✓ Migrated: ${oldFilename} → ${newFilename} (ID: ${scran.id})`);
      migrated++;
    } catch (error) {
      console.error(`✗ Failed: ${oldFilename}`, error);
      failed++;
    }
  }

  console.log("\n=== Migration Summary ===");
  console.log(`Total scrans: ${allScrans.length}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log("Migration complete!");
}

migrateImages().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
