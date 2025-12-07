import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251123020000 extends Migration {

  async up(): Promise<void> {
    // Create vendor table with all fields if it doesn't exist
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "vendor" (
        "id" text NOT NULL,
        "name" text NOT NULL,
        "first_name" text NULL,
        "last_name" text NULL,
        "email" text NOT NULL,
        "phone" text NULL,
        "telephone" text NULL,
        "pan_gst" text NULL,
        "gst_no" text NULL,
        "pan_no" text NULL,
        "documents" jsonb NULL,
        "store_name" text NULL,
        "store_phone" text NULL,
        "store_address" text NULL,
        "store_country" text NULL,
        "store_region" text NULL,
        "store_city" text NULL,
        "store_pincode" text NULL,
        "store_logo" text NULL,
        "store_banner" text NULL,
        "shipping_policy" text NULL,
        "return_policy" text NULL,
        "whatsapp_number" text NULL,
        "bank_name" text NULL,
        "account_no" text NULL,
        "ifsc_code" text NULL,
        "cancel_cheque_url" text NULL,
        "is_approved" boolean NOT NULL DEFAULT false,
        "approved_at" timestamptz NULL,
        "approved_by" text NULL,
        "marketplace_seller_id" text NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
      );
    `);

    // Create vendor_user table if it doesn't exist
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "vendor_user" (
        "id" text NOT NULL,
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "last_login_at" timestamptz NULL,
        "must_reset_password" boolean NOT NULL DEFAULT false,
        "metadata" jsonb NULL,
        "vendor_id" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "vendor_user_pkey" PRIMARY KEY ("id")
      );
    `);

    // Create indexes
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_email_unique" ON "vendor" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_deleted_at" ON "vendor" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_user_email_unique" ON "vendor_user" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_deleted_at" ON "vendor_user" ("deleted_at") WHERE deleted_at IS NULL;`);

    // Add any missing columns to existing table (if table already exists)
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '';`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "first_name" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "last_name" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "telephone" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_phone" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_address" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_country" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_region" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_city" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_pincode" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "store_banner" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "shipping_policy" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "return_policy" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "whatsapp_number" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "gst_no" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "pan_no" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "bank_name" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "account_no" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "ifsc_code" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "cancel_cheque_url" text NULL;`);
    this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "metadata" jsonb NULL;`);

    // Add must_reset_password to vendor_user if missing
    this.addSql(`ALTER TABLE IF EXISTS "vendor_user" ADD COLUMN IF NOT EXISTS "must_reset_password" boolean NOT NULL DEFAULT false;`);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "vendor" CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS "vendor_user" CASCADE;`);
  }
}

