"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251116083025 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251116083025 extends migrations_1.Migration {
    async up() {
        this.addSql(`alter table if exists "vendor_user" drop constraint if exists "vendor_user_email_unique";`);
        this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_email_unique";`);
        this.addSql(`create table if not exists "vendor" ("id" text not null, "name" text not null, "email" text not null, "phone" text null, "pan_gst" text null, "documents" jsonb null, "store_name" text null, "store_logo" text null, "is_approved" boolean not null default false, "approved_at" timestamptz null, "approved_by" text null, "marketplace_seller_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_pkey" primary key ("id"));`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_email_unique" ON "vendor" ("email") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_deleted_at" ON "vendor" ("deleted_at") WHERE deleted_at IS NULL;`);
        this.addSql(`create table if not exists "vendor_user" ("id" text not null, "email" text not null, "password_hash" text not null, "last_login_at" timestamptz null, "metadata" jsonb null, "vendor_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_user_pkey" primary key ("id"));`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_user_email_unique" ON "vendor_user" ("email") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_deleted_at" ON "vendor_user" ("deleted_at") WHERE deleted_at IS NULL;`);
    }
    async down() {
        this.addSql(`drop table if exists "vendor" cascade;`);
        this.addSql(`drop table if exists "vendor_user" cascade;`);
    }
}
exports.Migration20251116083025 = Migration20251116083025;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTExMTYwODMwMjUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTExNjA4MzAyNS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBcUU7QUFFckUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUVwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsMkZBQTJGLENBQUMsQ0FBQztRQUN6RyxJQUFJLENBQUMsTUFBTSxDQUFDLGlGQUFpRixDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnaEJBQWdoQixDQUFDLENBQUM7UUFDOWhCLElBQUksQ0FBQyxNQUFNLENBQUMsNkdBQTZHLENBQUMsQ0FBQztRQUMzSCxJQUFJLENBQUMsTUFBTSxDQUFDLHlHQUF5RyxDQUFDLENBQUM7UUFFdkgsSUFBSSxDQUFDLE1BQU0sQ0FBQyx5WEFBeVgsQ0FBQyxDQUFDO1FBQ3ZZLElBQUksQ0FBQyxNQUFNLENBQUMsdUhBQXVILENBQUMsQ0FBQztRQUNySSxJQUFJLENBQUMsTUFBTSxDQUFDLG1IQUFtSCxDQUFDLENBQUM7SUFDbkksQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJO1FBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBRXRELElBQUksQ0FBQyxNQUFNLENBQUMsNkNBQTZDLENBQUMsQ0FBQztJQUM3RCxDQUFDO0NBRUY7QUFwQkQsMERBb0JDIn0=