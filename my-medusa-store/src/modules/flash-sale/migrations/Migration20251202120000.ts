import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251202120000 extends Migration {

  async up(): Promise<void> {
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

  async down(): Promise<void> {
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
