import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260706120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "vendor_earnings_log" (
        "id" text NOT NULL,
        "vendor_id" text NOT NULL,
        "order_id" text NOT NULL,
        "order_display_id" text NULL,
        "gross_amount" numeric NOT NULL DEFAULT 0,
        "commission_rate" numeric NOT NULL DEFAULT 2,
        "commission_amount" numeric NOT NULL DEFAULT 0,
        "net_amount" numeric NOT NULL DEFAULT 0,
        "currency_code" text NOT NULL DEFAULT 'inr',
        "status" text NOT NULL DEFAULT 'UNLOCKING',
        "delivered_at" timestamptz NULL,
        "unlock_at" timestamptz NULL,
        "credited_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "vendor_earnings_log_pkey" PRIMARY KEY ("id")
      );
    `);
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_earnings_vendor_order"
      ON "vendor_earnings_log" ("vendor_id", "order_id");
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_earnings_vendor_status"
      ON "vendor_earnings_log" ("vendor_id", "status");
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_earnings_unlock_at"
      ON "vendor_earnings_log" ("unlock_at")
      WHERE "status" = 'UNLOCKING';
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "vendor_earnings_log" CASCADE;`);
  }
}
