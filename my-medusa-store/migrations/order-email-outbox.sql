BEGIN;

CREATE TABLE IF NOT EXISTS oweg_order_email_outbox (
  id uuid PRIMARY KEY,
  order_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('order_placed', 'order_shipped', 'order_delivered', 'order_cancelled')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  first_attempt_at timestamptz,
  request_hash text,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_oweg_order_email_pending
  ON oweg_order_email_outbox (available_at, id) WHERE status = 'pending';

COMMIT;
