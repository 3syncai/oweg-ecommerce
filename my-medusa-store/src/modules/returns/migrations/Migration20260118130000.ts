import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260118130000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table if not exists "return_request" (` +
        `"id" text not null, ` +
        `"order_id" text not null, ` +
        `"customer_id" text not null, ` +
        `"type" text not null, ` +
        `"status" text not null, ` +
        `"reason" text null, ` +
        `"notes" text null, ` +
        `"payment_type" text not null, ` +
        `"refund_method" text null, ` +
        `"bank_details_encrypted" text null, ` +
        `"bank_account_last4" text null, ` +
        `"approved_at" timestamptz null, ` +
        `"approved_by" text null, ` +
        `"rejected_at" timestamptz null, ` +
        `"rejected_by" text null, ` +
        `"rejection_reason" text null, ` +
        `"pickup_initiated_at" timestamptz null, ` +
        `"picked_up_at" timestamptz null, ` +
        `"received_at" timestamptz null, ` +
        `"refunded_at" timestamptz null, ` +
        `"shiprocket_order_id" text null, ` +
        `"shiprocket_awb" text null, ` +
        `"shiprocket_status" text null, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "return_request_pkey" primary key ("id")` +
      `);`
    )
    this.addSql(
      `create index if not exists "IDX_return_request_order_id" on "return_request" ("order_id") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_return_request_customer_id" on "return_request" ("customer_id") where deleted_at is null;`
    )

    this.addSql(
      `create table if not exists "return_request_item" (` +
        `"id" text not null, ` +
        `"return_request_id" text not null, ` +
        `"order_item_id" text not null, ` +
        `"quantity" integer not null, ` +
        `"condition" text null, ` +
        `"reason" text null, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "return_request_item_pkey" primary key ("id")` +
      `);`
    )
    this.addSql(
      `create index if not exists "IDX_return_request_item_request_id" on "return_request_item" ("return_request_id") where deleted_at is null;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "return_request_item" cascade;`)
    this.addSql(`drop table if exists "return_request" cascade;`)
  }
}
