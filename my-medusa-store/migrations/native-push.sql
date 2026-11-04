BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(74638293);

ALTER TABLE oweg_push_subscription
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'web_push',
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';

ALTER TABLE oweg_push_subscription
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

UPDATE oweg_push_subscription
SET provider = 'web_push', platform = 'web'
WHERE provider IS NULL OR platform IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oweg_push_subscription_provider_check'
  ) THEN
    ALTER TABLE oweg_push_subscription
      ADD CONSTRAINT oweg_push_subscription_provider_check
      CHECK (provider IN ('web_push', 'fcm'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oweg_push_subscription_platform_check'
  ) THEN
    ALTER TABLE oweg_push_subscription
      ADD CONSTRAINT oweg_push_subscription_platform_check
      CHECK (platform IN ('web', 'ios', 'android'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS oweg_push_provider_active_idx
  ON oweg_push_subscription(provider) WHERE active;

COMMIT;
