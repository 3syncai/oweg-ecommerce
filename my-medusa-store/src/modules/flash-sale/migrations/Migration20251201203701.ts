import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251201203701 extends Migration {

  async up(): Promise<void> {
    // Create flash_sale table
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
    
    // Add deleted_at column if it doesn't exist (for existing tables)
    this.addSql(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'flash_sale' AND column_name = 'deleted_at'
        ) THEN
          ALTER TABLE "flash_sale" ADD COLUMN "deleted_at" timestamptz null;
        END IF;
      END $$;
    `);
    
    // Create flash_sale_product table
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
    
    // Create indexes
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_enabled" 
      ON "flash_sale" ("enabled") 
      WHERE enabled = true;
    `);
    
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_time_range" 
      ON "flash_sale" ("start_time", "end_time");
    `);
    
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_product_flash_sale_id" 
      ON "flash_sale_product" ("flash_sale_id");
    `);
    
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_product_product_id" 
      ON "flash_sale_product" ("product_id");
    `);
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "flash_sale_product" cascade;`);
    this.addSql(`drop table if exists "flash_sale" cascade;`);
  }

}

