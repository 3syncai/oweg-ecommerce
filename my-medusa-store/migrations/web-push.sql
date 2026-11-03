BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(74638291);
CREATE TABLE IF NOT EXISTS oweg_push_subscription (
 id uuid PRIMARY KEY, customer_id text NOT NULL, endpoint text NOT NULL UNIQUE,
 p256dh text NOT NULL, auth text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oweg_push_customer_idx ON oweg_push_subscription(customer_id) WHERE active;
CREATE TABLE IF NOT EXISTS oweg_push_campaign (
 id uuid PRIMARY KEY, title text NOT NULL, body text NOT NULL, url text NOT NULL,
 image text, audience jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','scheduled','sending','completed','cancelled')),
 scheduled_at timestamptz, expires_at timestamptz NOT NULL,
 snapshot_at timestamptz, cursor_id uuid, prepared boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oweg_push_campaign_due_idx ON oweg_push_campaign(scheduled_at) WHERE status IN ('scheduled','sending');
CREATE INDEX IF NOT EXISTS oweg_push_campaign_retention_idx ON oweg_push_campaign(updated_at) WHERE status IN ('completed','cancelled');
CREATE TABLE IF NOT EXISTS oweg_push_delivery (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES oweg_push_campaign(id),
 subscription_id uuid NOT NULL REFERENCES oweg_push_subscription(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token uuid, error_code text, accepted_at timestamptz,
 click_token uuid NOT NULL UNIQUE, clicked_at timestamptz,
 UNIQUE(campaign_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS oweg_push_delivery_due_idx ON oweg_push_delivery(next_attempt) WHERE status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS oweg_push_delivery_subscription_idx ON oweg_push_delivery(subscription_id);
CREATE INDEX IF NOT EXISTS oweg_push_inactive_retention_idx ON oweg_push_subscription(updated_at) WHERE NOT active;
CREATE TABLE IF NOT EXISTS oweg_push_worker_state (
 worker_id text PRIMARY KEY, last_success_at timestamptz, last_error_at timestamptz
);
COMMIT;
