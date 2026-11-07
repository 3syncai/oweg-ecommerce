import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261107000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS whatsapp_notification_log (
      id text PRIMARY KEY, order_id text NOT NULL, customer_id text NULL,
      event_type text NOT NULL CHECK (event_type IN ('order_placed','order_shipped','order_delivered')),
      recipient_phone text NULL, payload_encrypted text NULL, template_name text NOT NULL,
      status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
      interakt_message_id text NULL, delivery_status text NOT NULL DEFAULT 'UNKNOWN',
      error_details text NULL, attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(), processing_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz NULL,
      CONSTRAINT whatsapp_notification_order_event_unique UNIQUE (order_id, event_type)
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS whatsapp_notification_pending_idx ON whatsapp_notification_log (next_attempt_at) WHERE status='PENDING';`)
  }
  async down(): Promise<void> { this.addSql(`DROP TABLE IF EXISTS whatsapp_notification_log;`) }
}
