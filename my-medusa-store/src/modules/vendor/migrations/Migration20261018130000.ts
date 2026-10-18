import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261018130000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "vendor_replacement_request"
      ADD COLUMN IF NOT EXISTS "expires_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "expiry_alert_sent_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "contact_method" text NULL,
      ADD COLUMN IF NOT EXISTS "decision_email_sent_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "decision_email_error" text NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "vendor_replacement_request_pending_expiry"
      ON "vendor_replacement_request" ("expires_at") WHERE "status"='pending';`)
  }

  async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "vendor_replacement_request_pending_expiry";`)
    this.addSql(`ALTER TABLE IF EXISTS "vendor_replacement_request"
      DROP COLUMN IF EXISTS "decision_email_error", DROP COLUMN IF EXISTS "decision_email_sent_at",
      DROP COLUMN IF EXISTS "contact_method", DROP COLUMN IF EXISTS "expiry_alert_sent_at", DROP COLUMN IF EXISTS "expires_at";`)
  }
}
