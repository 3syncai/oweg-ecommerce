import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251116083025 extends Migration {

  async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_user" drop constraint if exists "vendor_user_email_unique";`);
    this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_email_unique";`);
    this.addSql(`create table if not exists "vendor" ("id" text not null, "name" text not null, "email" text not null, "phone" text null, "pan_gst" text null, "documents" jsonb null, "store_name" text null, "store_logo" text null, "is_approved" boolean not null default false, "approved_at" timestamptz null, "approved_by" text null, "marketplace_seller_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_email_unique" ON "vendor" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_deleted_at" ON "vendor" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_user" ("id" text not null, "email" text not null, "password_hash" text not null, "last_login_at" timestamptz null, "metadata" jsonb null, "vendor_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_user_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_user_email_unique" ON "vendor_user" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_deleted_at" ON "vendor_user" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor" cascade;`);

    this.addSql(`drop table if exists "vendor_user" cascade;`);
  }

}
