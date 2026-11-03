CREATE TABLE IF NOT EXISTS oweg_home_feed_snapshot (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  published_at timestamptz NOT NULL
);
