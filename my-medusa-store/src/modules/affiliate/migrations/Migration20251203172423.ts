import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20251203172423 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table if not exists "affiliate_admin" (
        "id" text not null, 
        "name" text not null, 
        "email" text not null, 
        "password_hash" text not null, 
        "created_at" timestamptz not null default now(), 
        "last_login_at" timestamptz null, 
        "login_ip" text null, 
        "updated_at" timestamptz not null default now(), 
        "deleted_at" timestamptz null, 
        constraint "affiliate_admin_pkey" primary key ("id")
      );`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_admin_email_unique" ON "affiliate_admin" ("email") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_affiliate_admin_deleted_at" ON "affiliate_admin" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "affiliate_admin" cascade;`)
  }
}

