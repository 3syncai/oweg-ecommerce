import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251116131820 extends Migration {

  async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor" add column if not exists "metadata" jsonb null;`);
  }

  async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop column if exists "metadata";`);
  }

}
