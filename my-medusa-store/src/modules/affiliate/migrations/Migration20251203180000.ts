import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20251203180000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table if not exists "affiliate_user" (
        "id" text not null, 
        "name" text not null, 
        "email" text not null, 
        "password_hash" text not null, 
        "phone" text null, 
        "refer_code" text null, 
        "entry_sponsor" text null, 
        "is_agent" boolean not null default false, 
        "last_login_at" timestamptz null, 
        "login_ip" text null, 
        "metadata" jsonb null, 
        "updated_at" timestamptz not null default now(), 
        "deleted_at" timestamptz null, 
        constraint "affiliate_user_pkey" primary key ("id")
      );`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_user_email_unique" ON "affiliate_user" ("email") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_affiliate_user_deleted_at" ON "affiliate_user" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "affiliate_user" cascade;`)
  }
}

