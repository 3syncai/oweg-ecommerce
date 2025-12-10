"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251203193000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251203193000 extends migrations_1.Migration {
    async up() {
        // Add missing columns to affiliate_user table if they don't exist
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "is_approved" boolean not null default false;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "approved_at" timestamptz null;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "approved_by" text null;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "rejected_at" timestamptz null;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "rejected_by" text null;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "rejection_reason" text null;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "refer_code" text null;`);
        this.addSql(`ALTER TABLE "affiliate_user" ADD COLUMN IF NOT EXISTS "entry_sponsor" text null;`);
        // Add unique index for refer_code if it doesn't exist
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_user_refer_code_unique" ON "affiliate_user" ("refer_code") WHERE deleted_at IS NULL AND refer_code IS NOT NULL;`);
    }
    async down() {
        this.addSql(`DROP INDEX IF EXISTS "IDX_affiliate_user_refer_code_unique";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "rejection_reason";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "rejected_by";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "rejected_at";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "approved_by";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "approved_at";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "is_approved";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "entry_sponsor";`);
        this.addSql(`ALTER TABLE "affiliate_user" DROP COLUMN IF EXISTS "refer_code";`);
    }
}
exports.Migration20251203193000 = Migration20251203193000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDMxOTMwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTIwMzE5MzAwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLGtFQUFrRTtRQUNsRSxJQUFJLENBQUMsTUFBTSxDQUNULHFHQUFxRyxDQUN0RyxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCx1RkFBdUYsQ0FDeEYsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsZ0ZBQWdGLENBQ2pGLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULHVGQUF1RixDQUN4RixDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCxnRkFBZ0YsQ0FDakYsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QscUZBQXFGLENBQ3RGLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULCtFQUErRSxDQUNoRixDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCxrRkFBa0YsQ0FDbkYsQ0FBQTtRQUVELHNEQUFzRDtRQUN0RCxJQUFJLENBQUMsTUFBTSxDQUNULGtLQUFrSyxDQUNuSyxDQUFBO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJO1FBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FDVCw4REFBOEQsQ0FDL0QsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1Qsd0VBQXdFLENBQ3pFLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULG1FQUFtRSxDQUNwRSxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsbUVBQW1FLENBQ3BFLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULG1FQUFtRSxDQUNwRSxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QscUVBQXFFLENBQ3RFLENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULGtFQUFrRSxDQUNuRSxDQUFBO0lBQ0gsQ0FBQztDQUNGO0FBL0RELDBEQStEQyJ9