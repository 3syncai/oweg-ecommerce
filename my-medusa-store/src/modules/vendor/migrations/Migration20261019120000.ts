import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261019120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "vendor_replacement_request"
      ADD COLUMN IF NOT EXISTS "outcome_customer_email_sent_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "outcome_customer_email_error" text,
      ADD COLUMN IF NOT EXISTS "outcome_vendor_email_sent_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "outcome_vendor_email_error" text;`)
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "vendor_replacement_request"
      DROP COLUMN IF EXISTS "outcome_customer_email_sent_at",
      DROP COLUMN IF EXISTS "outcome_customer_email_error",
      DROP COLUMN IF EXISTS "outcome_vendor_email_sent_at",
      DROP COLUMN IF EXISTS "outcome_vendor_email_error";`)
  }
}
