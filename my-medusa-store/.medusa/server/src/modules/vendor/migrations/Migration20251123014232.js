"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251123014232 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251123014232 extends migrations_1.Migration {
    async up() {
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
    async down() {
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
exports.Migration20251123014232 = Migration20251123014232;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTExMjMwMTQyMzIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTEyMzAxNDIzMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBcUU7QUFFckUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUVwRCxLQUFLLENBQUMsRUFBRTtRQUNOLGtDQUFrQztRQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLGlGQUFpRixDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnRkFBZ0YsQ0FBQyxDQUFDO1FBQzlGLElBQUksQ0FBQyxNQUFNLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztRQUU5RiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxrRkFBa0YsQ0FBQyxDQUFDO1FBQ2hHLElBQUksQ0FBQyxNQUFNLENBQUMsb0ZBQW9GLENBQUMsQ0FBQztRQUNsRyxJQUFJLENBQUMsTUFBTSxDQUFDLG9GQUFvRixDQUFDLENBQUM7UUFDbEcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtRkFBbUYsQ0FBQyxDQUFDO1FBQ2pHLElBQUksQ0FBQyxNQUFNLENBQUMsaUZBQWlGLENBQUMsQ0FBQztRQUMvRixJQUFJLENBQUMsTUFBTSxDQUFDLG9GQUFvRixDQUFDLENBQUM7UUFDbEcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtRkFBbUYsQ0FBQyxDQUFDO1FBQ2pHLElBQUksQ0FBQyxNQUFNLENBQUMsc0ZBQXNGLENBQUMsQ0FBQztRQUNwRyxJQUFJLENBQUMsTUFBTSxDQUFDLG9GQUFvRixDQUFDLENBQUM7UUFDbEcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxzRkFBc0YsQ0FBQyxDQUFDO1FBRXBHLHFDQUFxQztRQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLDZFQUE2RSxDQUFDLENBQUM7UUFDM0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyw2RUFBNkUsQ0FBQyxDQUFDO1FBRTNGLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsTUFBTSxDQUFDLGdGQUFnRixDQUFDLENBQUM7UUFDOUYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpRkFBaUYsQ0FBQyxDQUFDO1FBQy9GLElBQUksQ0FBQyxNQUFNLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztRQUM5RixJQUFJLENBQUMsTUFBTSxDQUFDLHdGQUF3RixDQUFDLENBQUM7SUFDeEcsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJO1FBQ1IscUNBQXFDO1FBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsb0VBQW9FLENBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMsTUFBTSxDQUFDLG1FQUFtRSxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtRUFBbUUsQ0FBQyxDQUFDO1FBRWpGLGtDQUFrQztRQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLHFFQUFxRSxDQUFDLENBQUM7UUFDbkYsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO1FBQ3JGLElBQUksQ0FBQyxNQUFNLENBQUMsdUVBQXVFLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsTUFBTSxDQUFDLHNFQUFzRSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvRUFBb0UsQ0FBQyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxNQUFNLENBQUMsdUVBQXVFLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsTUFBTSxDQUFDLHNFQUFzRSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyx5RUFBeUUsQ0FBQyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxNQUFNLENBQUMsdUVBQXVFLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsTUFBTSxDQUFDLHlFQUF5RSxDQUFDLENBQUM7UUFFdkYsd0NBQXdDO1FBQ3hDLElBQUksQ0FBQyxNQUFNLENBQUMsZ0VBQWdFLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsTUFBTSxDQUFDLGdFQUFnRSxDQUFDLENBQUM7UUFFOUUsb0NBQW9DO1FBQ3BDLElBQUksQ0FBQyxNQUFNLENBQUMsbUVBQW1FLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsTUFBTSxDQUFDLG9FQUFvRSxDQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtRUFBbUUsQ0FBQyxDQUFDO1FBQ2pGLElBQUksQ0FBQyxNQUFNLENBQUMsMkVBQTJFLENBQUMsQ0FBQztJQUMzRixDQUFDO0NBQ0Y7QUEzREQsMERBMkRDIn0=