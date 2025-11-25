import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251123014232 extends Migration {

  async up(): Promise<void> {
    // Add personal information fields
    this.addSql(`alter table if exists "vendor" add column if not exists "first_name" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "last_name" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "telephone" text null;`);

    // Add store information fields
    this.addSql(`alter table if exists "vendor" add column if not exists "store_phone" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "store_address" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "store_country" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "store_region" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "store_city" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "store_pincode" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "store_banner" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "shipping_policy" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "return_policy" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "whatsapp_number" text null;`);

    // Add tax & legal information fields
    this.addSql(`alter table if exists "vendor" add column if not exists "gst_no" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "pan_no" text null;`);

    // Add banking information fields
    this.addSql(`alter table if exists "vendor" add column if not exists "bank_name" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "account_no" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "ifsc_code" text null;`);
    this.addSql(`alter table if exists "vendor" add column if not exists "cancel_cheque_url" text null;`);
  }

  async down(): Promise<void> {
    // Remove personal information fields
    this.addSql(`alter table if exists "vendor" drop column if exists "first_name";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "last_name";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "telephone";`);

    // Remove store information fields
    this.addSql(`alter table if exists "vendor" drop column if exists "store_phone";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_address";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_country";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_region";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_city";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_pincode";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_banner";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "shipping_policy";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "return_policy";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "whatsapp_number";`);

    // Remove tax & legal information fields
    this.addSql(`alter table if exists "vendor" drop column if exists "gst_no";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "pan_no";`);

    // Remove banking information fields
    this.addSql(`alter table if exists "vendor" drop column if exists "bank_name";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "account_no";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "ifsc_code";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "cancel_cheque_url";`);
  }
}

