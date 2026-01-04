import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251116190815 extends Migration {

  async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_user" add column if not exists "must_reset_password" boolean not null default false;`);
  }

  async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor_user" drop column if exists "must_reset_password";`);
  }

}
