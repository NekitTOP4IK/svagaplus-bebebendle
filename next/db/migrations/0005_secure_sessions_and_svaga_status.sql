CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" text PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token_hash" text NOT NULL UNIQUE,
  "family_id" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "last_used_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "absolute_expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "replaced_by_session_id" text,
  "user_agent_hash" text
);

CREATE INDEX IF NOT EXISTS "user_sessions_family_id_idx" ON "user_sessions" ("family_id");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" ("user_id");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_attempt_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_error" text;
ALTER TABLE "users" ALTER COLUMN "is_subscriber" DROP DEFAULT;
UPDATE "users" SET "is_subscriber" = NULL WHERE "last_synced_at" IS NULL;

ALTER TABLE "scrans" ALTER COLUMN "is_subscriber_at_submit" DROP DEFAULT;

-- Legacy rows were written before foreign keys existed. Preserve the row and
-- clear only an invalid optional association before adding the constraints.
UPDATE "scrans" AS s
SET "submitted_by_user_id" = NULL
WHERE "submitted_by_user_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = s."submitted_by_user_id");

UPDATE "daily_user_results" AS d
SET "user_id" = NULL
WHERE "user_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" AS u WHERE u."id" = d."user_id");

DO $$ BEGIN
  ALTER TABLE "scrans"
    ADD CONSTRAINT "scrans_submitted_by_user_id_users_id_fk"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "daily_user_results"
    ADD CONSTRAINT "daily_user_results_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
