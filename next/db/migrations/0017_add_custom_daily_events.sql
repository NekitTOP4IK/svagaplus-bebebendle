ALTER TABLE "daily_scrandles"
  ADD COLUMN "source" text DEFAULT 'regular' NOT NULL;

ALTER TABLE "daily_scrandles"
  ADD CONSTRAINT "daily_scrandles_source_check"
  CHECK ("source" IN ('regular', 'custom'));

CREATE TABLE "daily_custom_events" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "target_date" text NOT NULL,
  "status" text NOT NULL,
  "notify_authors" boolean DEFAULT false NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  CONSTRAINT "daily_custom_events_status_check"
    CHECK ("status" IN ('draft', 'published', 'cancelled'))
);

CREATE UNIQUE INDEX "daily_custom_events_active_date_uidx"
  ON "daily_custom_events" ("target_date")
  WHERE "status" <> 'cancelled';

CREATE TABLE "daily_custom_event_entries" (
  "event_id" integer NOT NULL REFERENCES "daily_custom_events"("id") ON DELETE CASCADE,
  "scran_id" integer NOT NULL REFERENCES "scrans"("id") ON DELETE RESTRICT,
  "position" integer NOT NULL,
  CONSTRAINT "daily_custom_event_entries_event_scran_pk" PRIMARY KEY ("event_id", "scran_id"),
  CONSTRAINT "daily_custom_event_entries_position_check" CHECK ("position" BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX "daily_custom_event_entries_event_position_uidx"
  ON "daily_custom_event_entries" ("event_id", "position");

CREATE INDEX "daily_custom_event_entries_scran_id_idx"
  ON "daily_custom_event_entries" ("scran_id");
