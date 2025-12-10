"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251201203701 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251201203701 extends migrations_1.Migration {
    async up() {
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
    async down() {
        this.addSql(`drop table if exists "flash_sale_product" cascade;`);
        this.addSql(`drop table if exists "flash_sale" cascade;`);
    }
}
exports.Migration20251201203701 = Migration20251201203701;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDEyMDM3MDEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9mbGFzaC1zYWxlL21pZ3JhdGlvbnMvTWlncmF0aW9uMjAyNTEyMDEyMDM3MDEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseUVBQXFFO0FBRXJFLE1BQWEsdUJBQXdCLFNBQVEsc0JBQVM7SUFFcEQsS0FBSyxDQUFDLEVBQUU7UUFDTiwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7Ozs7Ozs7OztLQWFYLENBQUMsQ0FBQztRQUVILGtFQUFrRTtRQUNsRSxJQUFJLENBQUMsTUFBTSxDQUFDOzs7Ozs7Ozs7O0tBVVgsQ0FBQyxDQUFDO1FBRUgsa0NBQWtDO1FBQ2xDLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7O0tBV1gsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7S0FJWCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDOzs7S0FHWCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDOzs7S0FHWCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDOzs7S0FHWCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDbEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO0lBQzVELENBQUM7Q0FFRjtBQTFFRCwwREEwRUMifQ==