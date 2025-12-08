import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20251203193000 extends Migration {
  async up(): Promise<void> {
    // Add missing columns to affiliate_user table if they don't exist
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "is_approved" boolean not null default false;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "approved_at" timestamptz null;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "approved_by" text null;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "rejected_at" timestamptz null;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "rejected_by" text null;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "rejection_reason" text null;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "refer_code" text null;`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "entry_sponsor" text null;`
    )
    
    // Add unique index for refer_code if it doesn't exist
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_user_refer_code_unique" ON "affiliate_user" ("refer_code") WHERE deleted_at IS NULL AND refer_code IS NOT NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(
      `DROP INDEX IF EXISTS "IDX_affiliate_user_refer_code_unique";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "rejection_reason";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "rejected_by";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "rejected_at";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "approved_by";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "approved_at";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "is_approved";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "entry_sponsor";`
    )
    this.addSql(
      `ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "refer_code";`
    )
  }
}

