import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Custom customer schema for OWEG.
 *
 * Safe on both greenfield and existing Medusa DBs:
 * - Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
 * - Skips unique phone index when duplicate phones already exist
 */
export class Migration20251108112413 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "customer_group"
      drop constraint if exists "customer_group_name_unique";
    `)
    this.addSql(`
      alter table if exists "customer"
      drop constraint if exists "customer_gst_number_unique";
    `)
    this.addSql(`
      alter table if exists "customer"
      drop constraint if exists "customer_phone_unique";
    `)
    this.addSql(`
      alter table if exists "customer"
      drop constraint if exists "customer_email_has_account_unique";
    `)

    // Greenfield create (no-op when table already exists)
    this.addSql(`create table if not exists "customer" (
      "id" text not null,
      "company_name" text null,
      "first_name" text not null,
      "last_name" text not null,
      "email" text not null,
      "phone" text not null,
      "has_account" boolean not null default false,
      "metadata" jsonb null,
      "created_by" text null,
      "customer_type" text check ("customer_type" in ('individual', 'business')) not null default 'individual',
      "gst_number" text null,
      "referral_code" text null,
      "newsletter_subscribe" boolean not null default false,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "customer_pkey" primary key ("id")
    );`)

    // Existing Medusa customer table: add missing OWEG columns
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ADD COLUMN IF NOT EXISTS "customer_type" text DEFAULT 'individual';
    `)
    this.addSql(`
      UPDATE "customer"
      SET "customer_type" = COALESCE("customer_type", 'individual');
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ALTER COLUMN "customer_type" SET DEFAULT 'individual';
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ALTER COLUMN "customer_type" SET NOT NULL;
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ADD COLUMN IF NOT EXISTS "gst_number" text NULL;
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ADD COLUMN IF NOT EXISTS "referral_code" text NULL;
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ADD COLUMN IF NOT EXISTS "newsletter_subscribe" boolean DEFAULT false;
    `)
    this.addSql(`
      UPDATE "customer"
      SET "newsletter_subscribe" = false
      WHERE "newsletter_subscribe" IS NULL;
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ALTER COLUMN "newsletter_subscribe" SET DEFAULT false;
    `)
    this.addSql(`
      ALTER TABLE IF EXISTS "customer"
      ALTER COLUMN "newsletter_subscribe" SET NOT NULL;
    `)

    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'customer_customer_type_check'
        ) THEN
          ALTER TABLE "customer"
          ADD CONSTRAINT customer_customer_type_check
          CHECK ("customer_type" IN ('individual', 'business'));
        END IF;
      END $$;
    `)

    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'customer_business_fields_check'
        ) THEN
          ALTER TABLE "customer" ADD CONSTRAINT customer_business_fields_check CHECK (
            customer_type = 'individual'
            OR (
              customer_type = 'business'
              AND company_name IS NOT NULL
              AND gst_number IS NOT NULL
            )
          );
        END IF;
      END $$;
    `)

    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_deleted_at" ON "customer" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_email_has_account_unique" ON "customer" ("email", "has_account") WHERE deleted_at IS NULL;`
    )

    // Phone uniqueness is desired but must not block migrate on legacy duplicates.
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_customer_phone_unique'
        ) THEN
          BEGIN
            CREATE UNIQUE INDEX "IDX_customer_phone_unique"
            ON "customer" ("phone")
            WHERE deleted_at IS NULL;
          EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE 'Skipping IDX_customer_phone_unique due to duplicate phone values';
          END;
        END IF;
      END $$;
    `)

    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_gst_number_unique" ON "customer" ("gst_number") WHERE deleted_at IS NULL AND customer_type = 'business' AND gst_number IS NOT NULL;`
    )

    this.addSql(
      `create table if not exists "customer_address" ("id" text not null, "address_name" text null, "is_default_shipping" boolean not null default false, "is_default_billing" boolean not null default false, "company" text null, "first_name" text null, "last_name" text null, "address_1" text null, "address_2" text null, "city" text null, "country_code" text null, "province" text null, "postal_code" text null, "phone" text null, "metadata" jsonb null, "customer_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_address_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_address_customer_id" ON "customer_address" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_address_deleted_at" ON "customer_address" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_address_unique_customer_billing" ON "customer_address" ("customer_id") WHERE "is_default_billing" = true AND deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_address_unique_customer_shipping" ON "customer_address" ("customer_id") WHERE "is_default_shipping" = true AND deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "customer_group" ("id" text not null, "name" text not null, "metadata" jsonb null, "created_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_group_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_group_deleted_at" ON "customer_group" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_group_name_unique" ON "customer_group" ("name") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "customer_group_customer" ("id" text not null, "created_by" text null, "metadata" jsonb null, "customer_id" text not null, "customer_group_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_group_customer_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_group_customer_customer_id" ON "customer_group_customer" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_group_customer_customer_group_id" ON "customer_group_customer" ("customer_group_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_group_customer_deleted_at" ON "customer_group_customer" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'customer_address_customer_id_foreign'
        ) THEN
          ALTER TABLE "customer_address"
          ADD CONSTRAINT "customer_address_customer_id_foreign"
          FOREIGN KEY ("customer_id") REFERENCES "customer" ("id")
          ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
      END $$;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "customer_address" drop constraint if exists "customer_address_customer_id_foreign";`
    )
    this.addSql(
      `ALTER TABLE IF EXISTS "customer" DROP CONSTRAINT IF EXISTS customer_business_fields_check;`
    )
    this.addSql(
      `ALTER TABLE IF EXISTS "customer" DROP CONSTRAINT IF EXISTS customer_customer_type_check;`
    )
    this.addSql(
      `ALTER TABLE IF EXISTS "customer" DROP COLUMN IF EXISTS "newsletter_subscribe";`
    )
    this.addSql(
      `ALTER TABLE IF EXISTS "customer" DROP COLUMN IF EXISTS "referral_code";`
    )
    this.addSql(
      `ALTER TABLE IF EXISTS "customer" DROP COLUMN IF EXISTS "gst_number";`
    )
    this.addSql(
      `ALTER TABLE IF EXISTS "customer" DROP COLUMN IF EXISTS "customer_type";`
    )
  }
}
