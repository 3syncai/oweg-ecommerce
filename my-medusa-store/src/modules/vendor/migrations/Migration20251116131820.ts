import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251116131820 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor" add column if not exists "metadata" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop column if exists "metadata";`);
  }

}
