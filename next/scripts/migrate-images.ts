#!/usr/bin/env tsx
/**
 * Migration script to download images from external URLs and store them locally.
 * Updates database records with new local paths.
 */

import { eq } from "drizzle-orm";
import { writeFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { db, scrans } from "../db/schema";

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), "../uploads");

interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  details: Array<{
    id: number;
    oldUrl: string;
    newUrl?: string;
    status: "migrated" | "skipped" | "error";
    error?: string;
  }>;
}

async function migrateImages(): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  console.log("📦 Fetching scrans from database...");

  // Get all scrans
  const allScrans = await db.select().from(scrans);
  result.total = allScrans.length;

  console.log(`📝 Found ${allScrans.length} scrans`);

  for (const scran of allScrans) {
    const oldUrl = scran.imageUrl;

    try {
      // Skip if already local
      if (oldUrl.startsWith("/uploads/")) {
        result.skipped++;
        result.details.push({
          id: scran.id,
          oldUrl,
          status: "skipped",
        });
        console.log(`⏭️  Skipping scran ${scran.id}: already local`);
        continue;
      }

      // Skip placehold.co URLs
      if (oldUrl.includes("placehold.co")) {
        result.skipped++;
        result.details.push({
          id: scran.id,
          oldUrl,
          status: "skipped",
        });
        console.log(`⏭️  Skipping scran ${scran.id}: placeholder image`);
        continue;
      }

      // Download image
      console.log(`📥 Downloading scran ${scran.id}: ${oldUrl}`);
      const response = await fetch(oldUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const ext = getExtensionFromContentType(contentType);
      const filename = `${uuidv4()}${ext}`;
      const filepath = join(UPLOADS_DIR, filename);

      // Save file
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filepath, buffer);

      const newUrl = `/cdn/${filename}`;
      await db
        .update(scrans)
        .set({ imageUrl: newUrl })
        .where(eq(scrans.id, scran.id));

      result.migrated++;
      result.details.push({
        id: scran.id,
        oldUrl,
        newUrl,
        status: "migrated",
      });

      console.log(`✅ Migrated scran ${scran.id}: ${newUrl}`);
    } catch (error) {
      result.errors++;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.details.push({
        id: scran.id,
        oldUrl,
        status: "error",
        error: errorMessage,
      });
      console.error(`❌ Error migrating scran ${scran.id}: ${errorMessage}`);
    }
  }

  return result;
}

function getExtensionFromContentType(contentType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };

  return mimeToExt[contentType.toLowerCase()] || ".jpg";
}

async function main() {
  console.log("🚀 Starting image migration...\n");

  const startTime = Date.now();
  const result = await migrateImages();
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Summary");
  console.log("=".repeat(50));
  console.log(`Total scrans: ${result.total}`);
  console.log(`✅ Migrated: ${result.migrated}`);
  console.log(`⏭️  Skipped: ${result.skipped}`);
  console.log(`❌ Errors: ${result.errors}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log("=".repeat(50));

  // Print errors if any
  const errors = result.details.filter((d) => d.status === "error");
  if (errors.length > 0) {
    console.log("\n❌ Errors encountered:");
    for (const error of errors) {
      console.log(`  - Scran ${error.id}: ${error.error}`);
    }
  }

  process.exit(result.errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
