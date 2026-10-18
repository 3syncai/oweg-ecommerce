import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Customer proof for an admin-recorded replacement acceptance. */
export class Migration20261018150000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "vendor_replacement_request"
      ADD COLUMN IF NOT EXISTS "consent_code_hash" text,
      ADD COLUMN IF NOT EXISTS "consent_variant_id" text,
      ADD COLUMN IF NOT EXISTS "consent_code_sent_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "consent_code_expires_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "consent_code_attempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "consent_code_verified_at" timestamptz;`)
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "vendor_replacement_request"
      DROP COLUMN IF EXISTS "consent_code_verified_at",
      DROP COLUMN IF EXISTS "consent_code_attempts",
      DROP COLUMN IF EXISTS "consent_code_expires_at",
      DROP COLUMN IF EXISTS "consent_code_sent_at",
      DROP COLUMN IF EXISTS "consent_variant_id",
      DROP COLUMN IF EXISTS "consent_code_hash";`)
  }
}
