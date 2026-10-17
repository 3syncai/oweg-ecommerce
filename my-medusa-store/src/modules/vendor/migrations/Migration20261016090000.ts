import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Customer-paid low-cart shipping is credited to the delivered vendor settlement. */
export class Migration20261016090000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        ADD COLUMN IF NOT EXISTS "customer_shipping_fee" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "customer_shipping_gst" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "customer_shipping_total" numeric NOT NULL DEFAULT 0;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        DROP COLUMN IF EXISTS "customer_shipping_fee",
        DROP COLUMN IF EXISTS "customer_shipping_gst",
        DROP COLUMN IF EXISTS "customer_shipping_total";
    `)
  }
}
