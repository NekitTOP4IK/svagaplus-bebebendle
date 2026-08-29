CREATE TABLE "daily_reentry_grants" (
  "scran_id" integer PRIMARY KEY REFERENCES "scrans"("id") ON DELETE CASCADE,
  "granted_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "consumed_at" timestamp with time zone,
  "consumed_for_date" text,
  "revoked_at" timestamp with time zone
);
