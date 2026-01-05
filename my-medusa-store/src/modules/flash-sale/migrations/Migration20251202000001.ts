import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251202000001 extends Migration {

  async up(): Promise<void> {
    // Drop old tables first
    this.addSql(`drop table if exists "flash_sale_product" cascade;`);
    this.addSql(`drop table if exists "flash_sale" cascade;`);
    
    // Create new simplified flash_sale_item table
    this.addSql(`
      create table if not exists "flash_sale_item" (
        "id" text not null,
        "product_id" text not null,
        "price_id" text not null,
        "expires_at" timestamptz not null,
        "deleted_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "flash_sale_item_pkey" primary key ("id")
      );
    `);
    
    // Create indexes for efficient queries
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_item_product_id" 
      ON "flash_sale_item" ("product_id");
    `);
    
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_item_expires_at" 
      ON "flash_sale_item" ("expires_at");
    `);
    
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_item_active" 
      ON "flash_sale_item" ("expires_at", "deleted_at") 
      WHERE deleted_at IS NULL;
    `);
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "flash_sale_item" cascade;`);
    
    // Recreate old tables (if needed for rollback)
    this.addSql(`
      create table if not exists "flash_sale" (
        "id" text not null,
        "title" text null,
        "enabled" boolean not null default false,
        "start_time" timestamptz not null,
        "end_time" timestamptz not null,
        "metadata" jsonb null,
        "deleted_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "flash_sale_pkey" primary key ("id")
      );
    `);
    
    this.addSql(`
      create table if not exists "flash_sale_product" (
        "id" text not null,
        "flash_sale_id" text not null,
        "product_id" text not null,
        "flash_sale_price" numeric not null,
        "original_price" numeric not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "flash_sale_product_pkey" primary key ("id")
      );
    `);
  }
}
