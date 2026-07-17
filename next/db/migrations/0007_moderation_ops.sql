ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "reject_reason" text;
--> statement-breakpoint
ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "rejected_at" timestamp;
--> statement-breakpoint
ALTER TABLE "scrans" ADD COLUMN IF NOT EXISTS "rejected_by_user_id" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_user_id" integer,
  "action" text NOT NULL,
  "scran_id" integer,
  "target_telegram_id" text,
  "details" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_audit_log_created_at_idx" ON "moderation_audit_log" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_audit_log_scran_id_idx" ON "moderation_audit_log" ("scran_id");
