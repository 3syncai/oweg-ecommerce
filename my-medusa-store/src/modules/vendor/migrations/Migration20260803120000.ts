import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Forward logistic fee (Easy Ship / self dispatch) + return courier fee on earnings.
 */
export class Migration20260803120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        ADD COLUMN IF NOT EXISTS "logistic_fee" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "return_fee" numeric NOT NULL DEFAULT 0;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_earnings_log"
        DROP COLUMN IF EXISTS "logistic_fee",
        DROP COLUMN IF EXISTS "return_fee";
    `)
  }
}
