ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_photo_url" text;
--> statement-breakpoint
ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "rejected" boolean DEFAULT false NOT NULL;
