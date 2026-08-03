import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Approved claim settlement amount (partial refund to vendor).
 */
export class Migration20260804120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_report"
      ADD COLUMN IF NOT EXISTS "approved_amount" numeric null;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_report"
      DROP COLUMN IF EXISTS "approved_amount";
    `)
  }
}
