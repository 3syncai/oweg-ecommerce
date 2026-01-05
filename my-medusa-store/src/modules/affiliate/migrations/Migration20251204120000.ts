import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20251204120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "affiliate_commission" (
        "id" text not null,
        "product_id" text null,
        "category_id" text null,
        "collection_id" text null,
        "type_id" text null,
        "commission_rate" numeric not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "affiliate_commission_pkey" primary key ("id")
      );
    `)

    // Create indexes for faster lookups
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_product_id" ON "affiliate_commission" ("product_id") WHERE deleted_at IS NULL AND product_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_category_id" ON "affiliate_commission" ("category_id") WHERE deleted_at IS NULL AND category_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_collection_id" ON "affiliate_commission" ("collection_id") WHERE deleted_at IS NULL AND collection_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_type_id" ON "affiliate_commission" ("type_id") WHERE deleted_at IS NULL AND type_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_deleted_at" ON "affiliate_commission" ("deleted_at") WHERE deleted_at IS NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      DROP INDEX IF EXISTS "IDX_affiliate_commission_product_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_category_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_collection_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_type_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_deleted_at";
      DROP TABLE IF EXISTS "affiliate_commission";
    `)
  }
}

