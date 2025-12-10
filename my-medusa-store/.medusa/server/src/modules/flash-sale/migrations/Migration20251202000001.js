"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251202000001 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251202000001 extends migrations_1.Migration {
    async up() {
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
    async down() {
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
exports.Migration20251202000001 = Migration20251202000001;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDIwMDAwMDEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9mbGFzaC1zYWxlL21pZ3JhdGlvbnMvTWlncmF0aW9uMjAyNTEyMDIwMDAwMDEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseUVBQXFFO0FBRXJFLE1BQWEsdUJBQXdCLFNBQVEsc0JBQVM7SUFFcEQsS0FBSyxDQUFDLEVBQUU7UUFDTix3QkFBd0I7UUFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxNQUFNLENBQUMsNENBQTRDLENBQUMsQ0FBQztRQUUxRCw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7Ozs7Ozs7S0FXWCxDQUFDLENBQUM7UUFFSCx1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7O0tBR1gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7O0tBR1gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7OztLQUlYLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSTtRQUNSLElBQUksQ0FBQyxNQUFNLENBQUMsaURBQWlELENBQUMsQ0FBQztRQUUvRCwrQ0FBK0M7UUFDL0MsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7Ozs7Ozs7OztLQWFYLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7O0tBV1gsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdkVELDBEQXVFQyJ9