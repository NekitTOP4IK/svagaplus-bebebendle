-- Competitive Daily mode: display names + domain tables
-- See docs/superpowers/specs/2026-07-23-competitive-daily-design.md §7

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "competitive_display_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "competitive_display_name_updated_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_display_name_lower_uidx"
  ON "users" (lower("competitive_display_name"))
  WHERE "competitive_display_name" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "competitive_pool_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "scran_id" integer NOT NULL UNIQUE REFERENCES "scrans"("id"),
  "enabled" boolean DEFAULT true NOT NULL,
  "likes_snapshot" integer NOT NULL,
  "dislikes_snapshot" integer NOT NULL,
  "last_used_date" text,
  "added_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "competitive_seasons" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "theme_key" text,
  "theme_config" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "competitive_dailies" (
  "id" serial PRIMARY KEY NOT NULL,
  "date" text NOT NULL UNIQUE,
  "season_id" integer NOT NULL REFERENCES "competitive_seasons"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "competitive_rounds" (
  "id" serial PRIMARY KEY NOT NULL,
  "daily_id" integer NOT NULL REFERENCES "competitive_dailies"("id") ON DELETE CASCADE,
  "round_number" integer NOT NULL,
  "scran_a_id" integer NOT NULL REFERENCES "scrans"("id"),
  "scran_b_id" integer NOT NULL REFERENCES "scrans"("id"),
  "likes_a" integer NOT NULL,
  "dislikes_a" integer NOT NULL,
  "likes_b" integer NOT NULL,
  "dislikes_b" integer NOT NULL,
  "pair_key" text NOT NULL UNIQUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_rounds_daily_round_uidx"
  ON "competitive_rounds" ("daily_id", "round_number");

CREATE TABLE IF NOT EXISTS "competitive_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_id" integer NOT NULL REFERENCES "competitive_rounds"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chosen_scran_id" integer NOT NULL REFERENCES "scrans"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_votes_user_round_uidx"
  ON "competitive_votes" ("user_id", "round_id");

CREATE TABLE IF NOT EXISTS "competitive_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" text NOT NULL,
  "season_id" integer NOT NULL REFERENCES "competitive_seasons"("id"),
  "hits" integer NOT NULL,
  "points" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_results_user_date_uidx"
  ON "competitive_results" ("user_id", "date");

CREATE INDEX IF NOT EXISTS "competitive_results_season_id_idx"
  ON "competitive_results" ("season_id");

CREATE TABLE IF NOT EXISTS "competitive_standings" (
  "season_id" integer NOT NULL REFERENCES "competitive_seasons"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "points" integer DEFAULT 0 NOT NULL,
  "days_played" integer DEFAULT 0 NOT NULL,
  "hits" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("season_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "competitive_standings_season_points_idx"
  ON "competitive_standings" ("season_id", "points");

CREATE TABLE IF NOT EXISTS "competitive_season_final_ranks" (
  "season_id" integer NOT NULL REFERENCES "competitive_seasons"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL,
  "points" integer NOT NULL,
  "days_played" integer NOT NULL,
  "hits" integer NOT NULL,
  "display_name_snapshot" text,
  PRIMARY KEY ("season_id", "user_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "competitive_season_final_ranks_season_rank_uidx"
  ON "competitive_season_final_ranks" ("season_id", "rank");
