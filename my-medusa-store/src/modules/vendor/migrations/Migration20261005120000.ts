import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Per-vendor + global default cancellation charge (rupees).
 */
export class Migration20261005120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor"
        ADD COLUMN IF NOT EXISTS "cancellation_charge" numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cancellation_charge_override" boolean NOT NULL DEFAULT false;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor"
        DROP COLUMN IF EXISTS "cancellation_charge",
        DROP COLUMN IF EXISTS "cancellation_charge_override";
    `)
  }
}
