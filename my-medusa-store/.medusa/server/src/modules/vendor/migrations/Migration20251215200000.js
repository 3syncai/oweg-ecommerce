"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251215200000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251215200000 extends migrations_1.Migration {
    async up() {
        // Add rejection fields to vendor table
        this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "rejection_reason" text NULL;`);
        this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "rejected_at" timestamptz NULL;`);
        this.addSql(`ALTER TABLE IF EXISTS "vendor" ADD COLUMN IF NOT EXISTS "rejected_by" text NULL;`);
    }
    async down() {
        this.addSql(`ALTER TABLE IF EXISTS "vendor" DROP COLUMN IF EXISTS "rejection_reason";`);
        this.addSql(`ALTER TABLE IF EXISTS "vendor" DROP COLUMN IF EXISTS "rejected_at";`);
        this.addSql(`ALTER TABLE IF EXISTS "vendor" DROP COLUMN IF EXISTS "rejected_by";`);
    }
}
exports.Migration20251215200000 = Migration20251215200000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMTUyMDAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTIxNTIwMDAwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBcUU7QUFFckUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUVwRCxLQUFLLENBQUMsRUFBRTtRQUNOLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLHVGQUF1RixDQUFDLENBQUM7UUFDckcsSUFBSSxDQUFDLE1BQU0sQ0FBQyx5RkFBeUYsQ0FBQyxDQUFDO1FBQ3ZHLElBQUksQ0FBQyxNQUFNLENBQUMsa0ZBQWtGLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLDBFQUEwRSxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDO1FBQ25GLElBQUksQ0FBQyxNQUFNLENBQUMscUVBQXFFLENBQUMsQ0FBQztJQUNyRixDQUFDO0NBQ0Y7QUFkRCwwREFjQyJ9