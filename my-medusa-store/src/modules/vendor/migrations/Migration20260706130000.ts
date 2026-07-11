import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260706130000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "vendor_payout" (
        "id" text NOT NULL,
        "vendor_id" text NOT NULL,
        "amount" numeric NOT NULL DEFAULT 0,
        "commission_amount" numeric NOT NULL DEFAULT 0,
        "net_amount" numeric NOT NULL DEFAULT 0,
        "commission_rate" numeric NOT NULL DEFAULT 2,
        "currency_code" text NOT NULL DEFAULT 'inr',
        "transaction_id" text NULL,
        "payment_method" text NOT NULL DEFAULT 'bank_transfer',
        "status" text NOT NULL DEFAULT 'pending',
        "razorpay_contact_id" text NULL,
        "razorpay_fund_account_id" text NULL,
        "razorpay_payout_id" text NULL,
        "razorpay_status" text NULL,
        "utr" text NULL,
        "failure_reason" text NULL,
        "notes" text NULL,
        "order_ids" jsonb NULL,
        "created_by" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "vendor_payout_pkey" PRIMARY KEY ("id")
      );
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_payout_vendor_id"
      ON "vendor_payout" ("vendor_id");
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_payout_status"
      ON "vendor_payout" ("status");
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "vendor_payout" CASCADE;`);
  }
}
