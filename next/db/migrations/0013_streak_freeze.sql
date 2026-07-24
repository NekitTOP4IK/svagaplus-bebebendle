-- One streak freeze charge per user per season (UI streak only; does not affect points).
CREATE TABLE IF NOT EXISTS "competitive_streak_freezes" (
  "season_id" integer NOT NULL REFERENCES "competitive_seasons"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "used_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("season_id", "user_id")
);
