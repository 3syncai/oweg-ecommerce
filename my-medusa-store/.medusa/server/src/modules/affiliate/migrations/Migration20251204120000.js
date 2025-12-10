"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251204120000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251204120000 extends migrations_1.Migration {
    async up() {
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
    `);
        // Create indexes for faster lookups
        this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_product_id" ON "affiliate_commission" ("product_id") WHERE deleted_at IS NULL AND product_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_category_id" ON "affiliate_commission" ("category_id") WHERE deleted_at IS NULL AND category_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_collection_id" ON "affiliate_commission" ("collection_id") WHERE deleted_at IS NULL AND collection_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_type_id" ON "affiliate_commission" ("type_id") WHERE deleted_at IS NULL AND type_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_affiliate_commission_deleted_at" ON "affiliate_commission" ("deleted_at") WHERE deleted_at IS NULL;
    `);
    }
    async down() {
        this.addSql(`
      DROP INDEX IF EXISTS "IDX_affiliate_commission_product_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_category_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_collection_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_type_id";
      DROP INDEX IF EXISTS "IDX_affiliate_commission_deleted_at";
      DROP TABLE IF EXISTS "affiliate_commission";
    `);
    }
}
exports.Migration20251204120000 = Migration20251204120000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDQxMjAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTIwNDEyMDAwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7Ozs7O0tBY1gsQ0FBQyxDQUFBO1FBRUYsb0NBQW9DO1FBQ3BDLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7OztLQU1YLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSTtRQUNSLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7S0FPWCxDQUFDLENBQUE7SUFDSixDQUFDO0NBQ0Y7QUF0Q0QsMERBc0NDIn0=