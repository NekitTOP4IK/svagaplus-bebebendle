ALTER TABLE "daily_custom_events"
  ADD COLUMN "show_event_badge" boolean DEFAULT true NOT NULL,
  ADD COLUMN "show_on_home" boolean DEFAULT false NOT NULL,
  ADD COLUMN "badge_style" text DEFAULT 'violet' NOT NULL;

ALTER TABLE "daily_custom_events"
  ADD CONSTRAINT "daily_custom_events_badge_style_check"
  CHECK ("badge_style" IN ('violet', 'gold', 'neon', 'rainbow'));
