import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Per-vendor platform fee offers + Sheet4 ledger breakdown on earnings.
 */
export class Migration20260928120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor"
        ADD COLUMN IF NOT EXISTS "platform_fee_rate" numeric NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS "platform_fee_override" boolean NOT NULL DEFAULT false;
    `)
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        ADD COLUMN IF NOT EXISTS "platform_fee" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "platform_gst" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "partner_commission" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "partner_gst" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "commission_gst" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "logistic_gst" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "listing_gst" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "listing_total" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cancellation_fee" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "platform_fee_rate" numeric NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS "partner_commission_rate" numeric NOT NULL DEFAULT 11;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor"
        DROP COLUMN IF EXISTS "platform_fee_rate",
        DROP COLUMN IF EXISTS "platform_fee_override";
    `)
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        DROP COLUMN IF EXISTS "platform_fee",
        DROP COLUMN IF EXISTS "platform_gst",
        DROP COLUMN IF EXISTS "partner_commission",
        DROP COLUMN IF EXISTS "partner_gst",
        DROP COLUMN IF EXISTS "commission_gst",
        DROP COLUMN IF EXISTS "logistic_gst",
        DROP COLUMN IF EXISTS "listing_gst",
        DROP COLUMN IF EXISTS "listing_total",
        DROP COLUMN IF EXISTS "cancellation_fee",
        DROP COLUMN IF EXISTS "platform_fee_rate",
        DROP COLUMN IF EXISTS "partner_commission_rate";
    `)
  }
}
