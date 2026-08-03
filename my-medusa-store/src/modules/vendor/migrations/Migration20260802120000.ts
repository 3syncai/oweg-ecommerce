import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Marketplace settlement tax columns on vendor_earnings_log
 * (GST taxable split + TCS s.52 + TDS s.194-O).
 */
export class Migration20260802120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        ADD COLUMN IF NOT EXISTS "taxable_amount" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "gst_amount" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "gst_rate" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "tcs_rate" numeric NOT NULL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS "tcs_amount" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "tds_rate" numeric NOT NULL DEFAULT 0.1,
        ADD COLUMN IF NOT EXISTS "tds_amount" numeric NOT NULL DEFAULT 0;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        DROP COLUMN IF EXISTS "taxable_amount",
        DROP COLUMN IF EXISTS "gst_amount",
        DROP COLUMN IF EXISTS "gst_rate",
        DROP COLUMN IF EXISTS "tcs_rate",
        DROP COLUMN IF EXISTS "tcs_amount",
        DROP COLUMN IF EXISTS "tds_rate",
        DROP COLUMN IF EXISTS "tds_amount";
    `)
  }
}
