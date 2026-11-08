import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261108010000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE whatsapp_notification_log
      DROP CONSTRAINT IF EXISTS whatsapp_notification_log_event_type_check;`)
    this.addSql(`ALTER TABLE whatsapp_notification_log
      ADD CONSTRAINT whatsapp_notification_log_event_type_check
      CHECK (event_type IN ('order_placed','order_shipped','order_delivered','order_cancelled'));`)
  }

  async down(): Promise<void> {
    // PostgreSQL refuses this rollback if cancellation logs exist; preserve audit records.
    this.addSql(`ALTER TABLE whatsapp_notification_log
      DROP CONSTRAINT IF EXISTS whatsapp_notification_log_event_type_check;`)
    this.addSql(`ALTER TABLE whatsapp_notification_log
      ADD CONSTRAINT whatsapp_notification_log_event_type_check
      CHECK (event_type IN ('order_placed','order_shipped','order_delivered'));`)
  }
}
