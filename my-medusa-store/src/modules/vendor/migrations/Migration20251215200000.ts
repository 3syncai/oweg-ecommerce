import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251215200000 extends Migration {

  async up(): Promise<void> {
    // Add rejection fields to vendor table
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "rejection_reason" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "rejected_at" timestamptz NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "rejected_by" text NULL;`);
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "vendor" DROP COLUMN IF EXISTS "rejection_reason";`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" DROP COLUMN IF EXISTS "rejected_at";`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" DROP COLUMN IF EXISTS "rejected_by";`);
  }
}

