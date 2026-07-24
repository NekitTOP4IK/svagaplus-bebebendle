-- Per-user competitive onboarding flags (admin-resettable).
CREATE TABLE IF NOT EXISTS "competitive_user_prefs" (
  "user_id" integer PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "intro_dismissed" boolean DEFAULT false NOT NULL,
  "nick_prompt_dismissed" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
