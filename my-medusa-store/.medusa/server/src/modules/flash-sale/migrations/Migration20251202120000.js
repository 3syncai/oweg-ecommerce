"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251202120000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251202120000 extends migrations_1.Migration {
    async up() {
        // Update flash_sale_item table to store prices instead of price_id
        this.addSql(`
      ALTER TABLE "flash_sale_item" 
      ADD COLUMN IF NOT EXISTS "variant_id" text,
      ADD COLUMN IF NOT EXISTS "flash_sale_price" numeric,
      ADD COLUMN IF NOT EXISTS "original_price" numeric,
      ADD COLUMN IF NOT EXISTS "original_price_id" text;
    `);
        // Migrate existing data if any (this is for transition period)
        // If price_id exists, we'll need to fetch original price first
        // For now, just add the new columns
        // Make price_id nullable since we're moving away from it
        this.addSql(`
      ALTER TABLE "flash_sale_item" 
      ALTER COLUMN "price_id" DROP NOT NULL;
    `);
        // Add index for variant_id
        this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_flash_sale_item_variant_id" 
      ON "flash_sale_item" ("variant_id");
    `);
    }
    async down() {
        // Remove new columns
        this.addSql(`
      ALTER TABLE "flash_sale_item" 
      DROP COLUMN IF EXISTS "variant_id",
      DROP COLUMN IF EXISTS "flash_sale_price",
      DROP COLUMN IF EXISTS "original_price",
      DROP COLUMN IF EXISTS "original_price_id";
    `);
        // Restore price_id as NOT NULL if needed
        this.addSql(`
      ALTER TABLE "flash_sale_item" 
      ALTER COLUMN "price_id" SET NOT NULL;
    `);
    }
}
exports.Migration20251202120000 = Migration20251202120000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDIxMjAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9mbGFzaC1zYWxlL21pZ3JhdGlvbnMvTWlncmF0aW9uMjAyNTEyMDIxMjAwMDAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseUVBQXFFO0FBRXJFLE1BQWEsdUJBQXdCLFNBQVEsc0JBQVM7SUFFcEQsS0FBSyxDQUFDLEVBQUU7UUFDTixtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7O0tBTVgsQ0FBQyxDQUFDO1FBRUgsK0RBQStEO1FBQy9ELCtEQUErRDtRQUMvRCxvQ0FBb0M7UUFFcEMseURBQXlEO1FBQ3pELElBQUksQ0FBQyxNQUFNLENBQUM7OztLQUdYLENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDOzs7S0FHWCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixxQkFBcUI7UUFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7O0tBTVgsQ0FBQyxDQUFDO1FBRUgseUNBQXlDO1FBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUM7OztLQUdYLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdDRCwwREE2Q0MifQ==