import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Customer approval for a replacement vendor, variant, or price. */
export class Migration20261018120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "vendor_replacement_request" (
        "id" text PRIMARY KEY,
        "order_id" text NOT NULL,
        "item_id" text NOT NULL,
        "customer_id" text NOT NULL,
        "customer_email" text NOT NULL,
        "original_title" text NOT NULL,
        "original_variant_id" text NOT NULL,
        "original_unit_price" numeric NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "options" jsonb NOT NULL,
        "message" text,
        "created_by" text NOT NULL,
        "selected_variant_id" text,
        "selected_vendor_id" text,
        "selected_unit_price" numeric,
        "adjustment_amount" numeric,
        "razorpay_order_id" text,
        "razorpay_payment_id" text,
        "razorpay_refund_id" text,
        "manual_refund_reference" text,
        "responded_by" text,
        "response_source" text,
        "response_at" timestamptz,
        "resolution_note" text,
        "email_sent_at" timestamptz,
        "email_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "vendor_replacement_request_one_pending"
        ON "vendor_replacement_request" ("order_id", "item_id")
        WHERE "status" IN ('pending', 'awaiting_payment', 'awaiting_refund', 'settling_refund', 'settlement_failed');
      CREATE INDEX IF NOT EXISTS "vendor_replacement_request_order"
        ON "vendor_replacement_request" ("order_id", "created_at" DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS "vendor_replacement_request_gateway_order"
        ON "vendor_replacement_request" ("razorpay_order_id") WHERE "razorpay_order_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "vendor_replacement_request_gateway_payment"
        ON "vendor_replacement_request" ("razorpay_payment_id") WHERE "razorpay_payment_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "vendor_replacement_request_gateway_refund"
        ON "vendor_replacement_request" ("razorpay_refund_id") WHERE "razorpay_refund_id" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "vendor_replacement_request_manual_refund"
        ON "vendor_replacement_request" ("manual_refund_reference") WHERE "manual_refund_reference" IS NOT NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "vendor_replacement_request";`)
  }
}
