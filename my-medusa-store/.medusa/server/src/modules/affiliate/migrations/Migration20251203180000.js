"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251203180000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251203180000 extends migrations_1.Migration {
    async up() {
        this.addSql(`create table if not exists "affiliate_user" (
        "id" text not null, 
        "name" text not null, 
        "email" text not null, 
        "password_hash" text not null, 
        "phone" text null, 
        "refer_code" text null, 
        "entry_sponsor" text null, 
        "is_agent" boolean not null default false, 
        "last_login_at" timestamptz null, 
        "login_ip" text null, 
        "metadata" jsonb null, 
        "updated_at" timestamptz not null default now(), 
        "deleted_at" timestamptz null, 
        constraint "affiliate_user_pkey" primary key ("id")
      );`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_user_email_unique" ON "affiliate_user" ("email") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_affiliate_user_deleted_at" ON "affiliate_user" ("deleted_at") WHERE deleted_at IS NULL;`);
    }
    async down() {
        this.addSql(`drop table if exists "affiliate_user" cascade;`);
    }
}
exports.Migration20251203180000 = Migration20251203180000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDMxODAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTIwMzE4MDAwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQ1Q7Ozs7Ozs7Ozs7Ozs7OztTQWVHLENBQ0osQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsNkhBQTZILENBQzlILENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULHlIQUF5SCxDQUMxSCxDQUFBO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJO1FBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnREFBZ0QsQ0FBQyxDQUFBO0lBQy9ELENBQUM7Q0FDRjtBQS9CRCwwREErQkMifQ==