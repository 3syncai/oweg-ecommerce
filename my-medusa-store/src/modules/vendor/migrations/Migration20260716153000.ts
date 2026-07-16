import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716153000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor"
      ADD COLUMN IF NOT EXISTS "commission_override" boolean NOT NULL DEFAULT false;
    `)
    this.addSql(`
      UPDATE "vendor" SET "commission_override" = false WHERE "commission_override" IS DISTINCT FROM false;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "vendor" DROP COLUMN IF EXISTS "commission_override";`)
  }
}
