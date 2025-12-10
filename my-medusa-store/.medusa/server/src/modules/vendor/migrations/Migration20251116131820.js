"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251116131820 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251116131820 extends migrations_1.Migration {
    async up() {
        this.addSql(`alter table if exists "vendor" add column if not exists "metadata" jsonb null;`);
    }
    async down() {
        this.addSql(`alter table if exists "vendor" drop column if exists "metadata";`);
    }
}
exports.Migration20251116131820 = Migration20251116131820;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTExMTYxMzE4MjAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTExNjEzMTgyMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBcUU7QUFFckUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUVwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztJQUNoRyxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLGtFQUFrRSxDQUFDLENBQUM7SUFDbEYsQ0FBQztDQUVGO0FBVkQsMERBVUMifQ==