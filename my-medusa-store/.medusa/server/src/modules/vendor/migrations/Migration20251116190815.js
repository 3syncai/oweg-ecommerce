"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251116190815 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251116190815 extends migrations_1.Migration {
    async up() {
        this.addSql(`alter table if exists "vendor_user" add column if not exists "must_reset_password" boolean not null default false;`);
    }
    async down() {
        this.addSql(`alter table if exists "vendor_user" drop column if exists "must_reset_password";`);
    }
}
exports.Migration20251116190815 = Migration20251116190815;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTExMTYxOTA4MTUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTExNjE5MDgxNS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBcUU7QUFFckUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUVwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsb0hBQW9ILENBQUMsQ0FBQztJQUNwSSxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLGtGQUFrRixDQUFDLENBQUM7SUFDbEcsQ0FBQztDQUVGO0FBVkQsMERBVUMifQ==