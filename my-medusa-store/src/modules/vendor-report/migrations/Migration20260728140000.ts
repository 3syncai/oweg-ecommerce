import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260728140000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table if not exists "vendor_report" (` +
        `"id" text not null, ` +
        `"vendor_id" text not null, ` +
        `"order_id" text not null, ` +
        `"order_display_id" text null, ` +
        `"return_request_id" text null, ` +
        `"source" text not null, ` +
        `"issue_title" text not null, ` +
        `"issue_description" text not null, ` +
        `"product_snapshot" jsonb null, ` +
        `"order_snapshot" jsonb null, ` +
        `"image_urls" jsonb null, ` +
        `"status" text not null default 'open', ` +
        `"admin_notes" text null, ` +
        `"resolved_at" timestamptz null, ` +
        `"resolved_by" text null, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "vendor_report_pkey" primary key ("id")` +
      `);`
    )
    this.addSql(
      `create index if not exists "IDX_vendor_report_vendor_id" on "vendor_report" ("vendor_id") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_vendor_report_order_id" on "vendor_report" ("order_id") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_vendor_report_status" on "vendor_report" ("status") where deleted_at is null;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_report" cascade;`)
  }
}
