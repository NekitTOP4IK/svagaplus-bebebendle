CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY,
	"telegram_id" bigint NOT NULL,
	"telegram_username" text,
	"display_name" text,
	"role" text NOT NULL DEFAULT 'player',
	"svaga_telegram_user_id" bigint,
	"svaga_user_id" text,
	"is_subscriber" boolean DEFAULT false,
	"last_synced_at" timestamp,
	"linked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_id_unique" ON "users" ("telegram_id");
CREATE INDEX IF NOT EXISTS "users_telegram_id_idx" ON "users" ("telegram_id");

ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "submitted_by_user_id" integer;
ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "is_subscriber_at_submit" boolean DEFAULT false;
ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "subscriber_checked_at" timestamp;

ALTER TABLE "daily_user_results" ADD COLUMN IF NOT EXISTS "user_id" integer;

CREATE INDEX IF NOT EXISTS "scrans_submitted_by_user_id_idx" ON "scrans" ("submitted_by_user_id");
CREATE INDEX IF NOT EXISTS "scrans_is_subscriber_at_submit_idx" ON "scrans" ("is_subscriber_at_submit");
CREATE INDEX IF NOT EXISTS "daily_user_results_user_id_idx" ON "daily_user_results" ("user_id");
