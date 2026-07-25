ALTER TABLE "users"
  ADD COLUMN "competitive_streak_freeze_season_id" integer REFERENCES "competitive_seasons"("id") ON DELETE SET NULL,
  ADD COLUMN "competitive_streak_freeze_used_at" timestamp with time zone,
  ADD COLUMN "competitive_streak_freeze_date" text;

-- A legacy freeze did not record the missed date it bridged. Preserve it only
-- when its season has exactly one derivable one-day result gap; otherwise clear
-- the old spend so an ambiguous record cannot remove both a streak and a charge.
WITH "latest_freeze" AS (
  SELECT DISTINCT ON ("freeze"."user_id")
    "freeze"."user_id",
    "freeze"."season_id",
    "freeze"."used_at"
  FROM "competitive_streak_freezes" AS "freeze"
  ORDER BY "freeze"."user_id", "freeze"."used_at" DESC, "freeze"."season_id" DESC
), "candidate" AS (
  SELECT
    "freeze"."user_id",
    "freeze"."season_id",
    ("before"."date"::date + 1)::text AS "freeze_date",
    COUNT(*) OVER (PARTITION BY "freeze"."user_id", "freeze"."season_id") AS "candidate_count"
  FROM "latest_freeze" AS "freeze"
  INNER JOIN "competitive_results" AS "before"
    ON "before"."user_id" = "freeze"."user_id" AND "before"."season_id" = "freeze"."season_id"
  INNER JOIN "competitive_results" AS "after"
    ON "after"."user_id" = "before"."user_id"
    AND "after"."season_id" = "before"."season_id"
    AND "after"."date"::date = "before"."date"::date + 2
), "legacy_gap" AS (
  SELECT "freeze"."user_id", "freeze"."season_id", "freeze"."used_at", "candidate"."freeze_date"
  FROM "latest_freeze" AS "freeze"
  LEFT JOIN "candidate"
    ON "candidate"."user_id" = "freeze"."user_id"
    AND "candidate"."season_id" = "freeze"."season_id"
    AND "candidate"."candidate_count" = 1
)
UPDATE "users" AS "user"
SET
  "competitive_streak_freeze_season_id" = CASE WHEN "legacy_gap"."freeze_date" IS NULL THEN NULL ELSE "legacy_gap"."season_id" END,
  "competitive_streak_freeze_used_at" = CASE WHEN "legacy_gap"."freeze_date" IS NULL THEN NULL ELSE "legacy_gap"."used_at" END,
  "competitive_streak_freeze_date" = "legacy_gap"."freeze_date"
FROM "legacy_gap"
WHERE "user"."id" = "legacy_gap"."user_id";

DROP TABLE "competitive_streak_freezes";
