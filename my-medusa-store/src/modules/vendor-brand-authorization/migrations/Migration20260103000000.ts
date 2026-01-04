import { Migration } from "@mikro-orm/migrations"

export class Migration20260103000000 extends Migration {
    async up(): Promise<void> {
        this.addSql(`
      CREATE TABLE IF NOT EXISTS "vendor_brand_authorization" (
        "id" TEXT NOT NULL,
        "vendor_id" TEXT NOT NULL,
        "brand_name" TEXT NOT NULL,
        "authorization_file_url" TEXT NOT NULL,
        "authorization_file_key" TEXT NOT NULL,
        "verified" BOOLEAN NOT NULL DEFAULT false,
        "verified_at" TIMESTAMPTZ,
        "verified_by" TEXT,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ,
        PRIMARY KEY ("id")
      );
    `)

        // Create index on vendor_id for fast lookups
        this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_brand_auth_vendor_id" 
      ON "vendor_brand_authorization" ("vendor_id");
    `)

        // Create index on brand_name for fast lookups
        this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_brand_auth_brand_name" 
      ON "vendor_brand_authorization" ("brand_name");
    `)

        // Create unique constraint on vendor_id + brand_name (case-insensitive)
        this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_brand_auth_unique" 
      ON "vendor_brand_authorization" ("vendor_id", LOWER("brand_name")) 
      WHERE "deleted_at" IS NULL;
    `)
    }

    async down(): Promise<void> {
        this.addSql(`DROP TABLE IF EXISTS "vendor_brand_authorization" CASCADE;`)
    }
}
