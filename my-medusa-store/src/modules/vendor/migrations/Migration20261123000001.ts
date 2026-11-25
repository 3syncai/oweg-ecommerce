import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261123000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS vendor_user_activity (
      user_id text PRIMARY KEY REFERENCES vendor_user(id) ON DELETE CASCADE,
      login_ip inet, login_at timestamptz, activity_ip inet, activity_at timestamptz
    )`)
  }
  async down(): Promise<void> {
    this.addSql("DROP TABLE IF EXISTS vendor_user_activity")
  }
}
