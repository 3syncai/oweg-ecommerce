"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251203190000 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251203190000 extends migrations_1.Migration {
    async up() {
        // Drop old affiliate_user table if it exists (to recreate with new schema)
        this.addSql(`drop table if exists "affiliate_user" cascade;`);
        // Create new affiliate_user table with all fields
        this.addSql(`create table if not exists "affiliate_user" (
        "id" text not null, 
        "first_name" text not null, 
        "last_name" text not null, 
        "email" text not null, 
        "password_hash" text not null, 
        "phone" text null, 
        "refer_code" text null, 
        "entry_sponsor" text null, 
        "is_agent" boolean not null default false, 
        "gender" text null, 
        "father_name" text null, 
        "mother_name" text null, 
        "birth_date" timestamptz null, 
        "qualification" text null, 
        "marital_status" text null, 
        "blood_group" text null, 
        "emergency_person_name" text null, 
        "emergency_person_mobile" text null, 
        "aadhar_card_no" text null, 
        "pan_card_no" text null, 
        "aadhar_card_photo" text null, 
        "pan_card_photo" text null, 
        "designation" text null, 
        "sales_target" text null, 
        "branch" text null, 
        "area" text null, 
        "state" text null, 
        "payment_method" text null, 
        "bank_name" text null, 
        "bank_branch" text null, 
        "ifsc_code" text null, 
        "account_name" text null, 
        "account_number" text null, 
        "address_1" text null, 
        "address_2" text null, 
        "city" text null, 
        "pin_code" text null, 
        "country" text null, 
        "address_state" text null, 
        "is_approved" boolean not null default false, 
        "approved_at" timestamptz null, 
        "approved_by" text null, 
        "rejected_at" timestamptz null, 
        "rejected_by" text null, 
        "rejection_reason" text null, 
        "last_login_at" timestamptz null, 
        "login_ip" text null, 
        "metadata" jsonb null, 
        "created_at" timestamptz not null default now(), 
        "updated_at" timestamptz not null default now(), 
        "deleted_at" timestamptz null, 
        constraint "affiliate_user_pkey" primary key ("id")
      );`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_user_email_unique" ON "affiliate_user" ("email") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_user_refer_code_unique" ON "affiliate_user" ("refer_code") WHERE deleted_at IS NULL AND refer_code IS NOT NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_affiliate_user_deleted_at" ON "affiliate_user" ("deleted_at") WHERE deleted_at IS NULL;`);
        // Ensure affiliate_admin has login_ip column
        this.addSql(`ALTER TABLE "affiliate_admin" ADD COLUMN IF NOT EXISTS "login_ip" text null;`);
    }
    async down() {
        this.addSql(`drop table if exists "affiliate_user" cascade;`);
        this.addSql(`ALTER TABLE "affiliate_admin" DROP COLUMN IF EXISTS "login_ip";`);
    }
}
exports.Migration20251203190000 = Migration20251203190000;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTEyMDMxOTAwMDAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9hZmZpbGlhdGUvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTIwMzE5MDAwMC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBb0U7QUFFcEUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLDJFQUEyRTtRQUMzRSxJQUFJLENBQUMsTUFBTSxDQUFDLGdEQUFnRCxDQUFDLENBQUE7UUFFN0Qsa0RBQWtEO1FBQ2xELElBQUksQ0FBQyxNQUFNLENBQ1Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBcURHLENBQ0osQ0FBQTtRQUNELElBQUksQ0FBQyxNQUFNLENBQ1QsNkhBQTZILENBQzlILENBQUE7UUFDRCxJQUFJLENBQUMsTUFBTSxDQUNULGtLQUFrSyxDQUNuSyxDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FDVCx5SEFBeUgsQ0FDMUgsQ0FBQTtRQUVELDZDQUE2QztRQUM3QyxJQUFJLENBQUMsTUFBTSxDQUNULDhFQUE4RSxDQUMvRSxDQUFBO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJO1FBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnREFBZ0QsQ0FBQyxDQUFBO1FBQzdELElBQUksQ0FBQyxNQUFNLENBQUMsaUVBQWlFLENBQUMsQ0FBQTtJQUNoRixDQUFDO0NBQ0Y7QUFsRkQsMERBa0ZDIn0=