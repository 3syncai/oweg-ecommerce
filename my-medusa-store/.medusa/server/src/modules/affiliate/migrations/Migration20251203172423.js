"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251203172423 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251203172423 extends migrations_1.Migration {
    async up() {
        this.addSql(`create table if not exists "affiliate_admin" (
        "id" text not null, 
        "name" text not null, 
        "email" text not null, 
        "password_hash" text not null, 
        "created_at" timestamptz not null default now(), 
        "last_login_at" timestamptz null, 
        "login_ip" text null, 
        "updated_at" timestamptz not null default now(), 
        "deleted_at" timestamptz null, 
        constraint "affiliate_admin_pkey" primary key ("id")
      );`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_admin_email_unique" ON "affiliate_admin" ("email") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_affiliate_admin_deleted_at" ON "affiliate_admin" ("deleted_at") WHERE deleted_at IS NULL;`);
    }
    async down() {
        this.addSql(`drop table if exists "affiliate_admin" cascade;`);
    }
}
exports.Migration20251203172423 = Migration20251203172423;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDMxNzI0MjMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTIwMzE3MjQyMy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQ1Q7Ozs7Ozs7Ozs7O1NBV0csQ0FDSixDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCwrSEFBK0gsQ0FDaEksQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsMkhBQTJILENBQzVILENBQUE7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLGlEQUFpRCxDQUFDLENBQUE7SUFDaEUsQ0FBQztDQUNGO0FBM0JELDBEQTJCQyJ9