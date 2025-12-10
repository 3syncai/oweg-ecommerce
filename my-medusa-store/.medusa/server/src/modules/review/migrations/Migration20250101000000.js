"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20250101000000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20250101000000 extends migrations_1.Migration {
    async up() {
        this.addSql(`
      CREATE TABLE IF NOT EXISTS "product_review" (
        "id" text NOT NULL,
        "product_id" text NOT NULL,
        "customer_id" text NULL,
        "reviewer_name" text NOT NULL,
        "reviewer_email" text NULL,
        "title" text NOT NULL,
        "content" text NOT NULL,
        "rating" text NOT NULL,
        "images" jsonb NULL,
        "videos" jsonb NULL,
        "verified_purchase" boolean NOT NULL DEFAULT false,
        "helpful_count" text NOT NULL DEFAULT '0',
        "status" text NOT NULL DEFAULT 'pending',
        "variant_id" text NULL,
        "order_id" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        "metadata" jsonb NULL,
        CONSTRAINT "product_review_pkey" PRIMARY KEY ("id")
      );

      CREATE INDEX IF NOT EXISTS "IDX_product_review_product_id" ON "product_review" ("product_id");
      CREATE INDEX IF NOT EXISTS "IDX_product_review_customer_id" ON "product_review" ("customer_id");
      CREATE INDEX IF NOT EXISTS "IDX_product_review_status" ON "product_review" ("status");
      CREATE INDEX IF NOT EXISTS "IDX_product_review_rating" ON "product_review" ("rating");
      CREATE INDEX IF NOT EXISTS "IDX_product_review_created_at" ON "product_review" ("created_at");
      CREATE INDEX IF NOT EXISTS "IDX_product_review_deleted_at" ON "product_review" ("deleted_at") WHERE deleted_at IS NULL;
    `);
    }
    async down() {
        this.addSql(`DROP TABLE IF EXISTS "product_review" CASCADE;`);
    }
}
exports.Migration20250101000000 = Migration20250101000000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTAxMDEwMDAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9yZXZpZXcvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MDEwMTAwMDAwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQThCWCxDQUFDLENBQUE7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLGdEQUFnRCxDQUFDLENBQUE7SUFDL0QsQ0FBQztDQUNGO0FBdENELDBEQXNDQyJ9