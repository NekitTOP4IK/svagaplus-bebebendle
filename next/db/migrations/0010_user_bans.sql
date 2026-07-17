CREATE TABLE IF NOT EXISTS "user_bans" (
  "telegram_id" text PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "reason_code" text NOT NULL,
  "banned_by_user_id" integer REFERENCES "users"("id"),
  "banned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_bans_active_idx" ON "user_bans" ("active");
CREATE INDEX IF NOT EXISTS "user_bans_banned_at_idx" ON "user_bans" ("banned_at");
