import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20261031120000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "flash_sale_item" add column if not exists "title" text null;')
  }
  async down(): Promise<void> {
    this.addSql('alter table "flash_sale_item" drop column if exists "title";')
  }
}
