INSERT INTO "app_settings" ("key", "value")
VALUES
  ('daily_generation_enabled', 'true'),
  ('daily_disabled_reason', '')
ON CONFLICT ("key") DO NOTHING;
