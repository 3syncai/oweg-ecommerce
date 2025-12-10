"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251108112413 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251108112413 extends migrations_1.Migration {
    async up() {
        this.addSql(`alter table if exists "customer_group" drop constraint if exists "customer_group_name_unique";`);
        this.addSql(`alter table if exists "customer" drop constraint if exists "customer_gst_number_unique";`);
        this.addSql(`alter table if exists "customer" drop constraint if exists "customer_phone_unique";`);
        this.addSql(`alter table if exists "customer" drop constraint if exists "customer_email_has_account_unique";`);
        this.addSql(`create table if not exists "customer" (
      "id" text not null,
      "company_name" text null,
      "first_name" text not null,
      "last_name" text not null,
      "email" text not null,
      "phone" text not null,
      "has_account" boolean not null default false,
      "metadata" jsonb null,
      "created_by" text null,
      "customer_type" text check ("customer_type" in ('individual', 'business')) not null default 'individual',
      "gst_number" text null,
      "referral_code" text null,
      "newsletter_subscribe" boolean not null default false,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "customer_pkey" primary key ("id"),
      constraint customer_business_fields_check check (
        customer_type = 'individual'
        OR (
          customer_type = 'business'
          AND company_name IS NOT NULL
          AND gst_number IS NOT NULL
        )
      )
    );`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_deleted_at" ON "customer" ("deleted_at") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_email_has_account_unique" ON "customer" ("email", "has_account") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_phone_unique" ON "customer" ("phone") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_gst_number_unique" ON "customer" ("gst_number") WHERE deleted_at IS NULL AND customer_type = 'business' AND gst_number IS NOT NULL;`);
        this.addSql(`create table if not exists "customer_address" ("id" text not null, "address_name" text null, "is_default_shipping" boolean not null default false, "is_default_billing" boolean not null default false, "company" text null, "first_name" text null, "last_name" text null, "address_1" text null, "address_2" text null, "city" text null, "country_code" text null, "province" text null, "postal_code" text null, "phone" text null, "metadata" jsonb null, "customer_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_address_pkey" primary key ("id"));`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_address_customer_id" ON "customer_address" ("customer_id") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_address_deleted_at" ON "customer_address" ("deleted_at") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_address_unique_customer_billing" ON "customer_address" ("customer_id") WHERE "is_default_billing" = true AND deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_address_unique_customer_shipping" ON "customer_address" ("customer_id") WHERE "is_default_shipping" = true AND deleted_at IS NULL;`);
        this.addSql(`create table if not exists "customer_group" ("id" text not null, "name" text not null, "metadata" jsonb null, "created_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_group_pkey" primary key ("id"));`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_group_deleted_at" ON "customer_group" ("deleted_at") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_group_name_unique" ON "customer_group" ("name") WHERE deleted_at IS NULL;`);
        this.addSql(`create table if not exists "customer_group_customer" ("id" text not null, "created_by" text null, "metadata" jsonb null, "customer_id" text not null, "customer_group_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_group_customer_pkey" primary key ("id"));`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_group_customer_customer_id" ON "customer_group_customer" ("customer_id") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_group_customer_customer_group_id" ON "customer_group_customer" ("customer_group_id") WHERE deleted_at IS NULL;`);
        this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_group_customer_deleted_at" ON "customer_group_customer" ("deleted_at") WHERE deleted_at IS NULL;`);
        this.addSql(`alter table if exists "customer_address" add constraint "customer_address_customer_id_foreign" foreign key ("customer_id") references "customer" ("id") on update cascade on delete cascade;`);
    }
    async down() {
        this.addSql(`alter table if exists "customer_address" drop constraint if exists "customer_address_customer_id_foreign";`);
        this.addSql(`drop table if exists "customer" cascade;`);
        this.addSql(`drop table if exists "customer_address" cascade;`);
        this.addSql(`drop table if exists "customer_group" cascade;`);
        this.addSql(`drop table if exists "customer_group_customer" cascade;`);
    }
}
exports.Migration20251108112413 = Migration20251108112413;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTExMDgxMTI0MTMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9jdXN0b21lci9taWdyYXRpb25zL01pZ3JhdGlvbjIwMjUxMTA4MTEyNDEzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHlFQUFxRTtBQUVyRSxNQUFhLHVCQUF3QixTQUFRLHNCQUFTO0lBQzNDLEtBQUssQ0FBQyxFQUFFO1FBQ2YsSUFBSSxDQUFDLE1BQU0sQ0FDVCxnR0FBZ0csQ0FDakcsQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQ1QsMEZBQTBGLENBQzNGLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUNULHFGQUFxRixDQUN0RixDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDVCxpR0FBaUcsQ0FDbEcsQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BMEJULENBQUMsQ0FBQztRQUNMLElBQUksQ0FBQyxNQUFNLENBQ1QsNkdBQTZHLENBQzlHLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUNULDRJQUE0SSxDQUM3SSxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDVCxpSEFBaUgsQ0FDbEgsQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQ1QscUxBQXFMLENBQ3RMLENBQUM7UUFFRixJQUFJLENBQUMsTUFBTSxDQUNULHNwQkFBc3BCLENBQ3ZwQixDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDVCwrSEFBK0gsQ0FDaEksQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQ1QsNkhBQTZILENBQzlILENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUNULGtMQUFrTCxDQUNuTCxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDVCxvTEFBb0wsQ0FDckwsQ0FBQztRQUVGLElBQUksQ0FBQyxNQUFNLENBQ1QsOFRBQThULENBQy9ULENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUNULHlIQUF5SCxDQUMxSCxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDVCwySEFBMkgsQ0FDNUgsQ0FBQztRQUVGLElBQUksQ0FBQyxNQUFNLENBQ1QsMFhBQTBYLENBQzNYLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUNULDZJQUE2SSxDQUM5SSxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FDVCx5SkFBeUosQ0FDMUosQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQ1QsMklBQTJJLENBQzVJLENBQUM7UUFFRixJQUFJLENBQUMsTUFBTSxDQUNULDhMQUE4TCxDQUMvTCxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxJQUFJO1FBQ2pCLElBQUksQ0FBQyxNQUFNLENBQ1QsNEdBQTRHLENBQzdHLENBQUM7UUFFRixJQUFJLENBQUMsTUFBTSxDQUFDLDBDQUEwQyxDQUFDLENBQUM7UUFFeEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxrREFBa0QsQ0FBQyxDQUFDO1FBRWhFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0RBQWdELENBQUMsQ0FBQztRQUU5RCxJQUFJLENBQUMsTUFBTSxDQUFDLHlEQUF5RCxDQUFDLENBQUM7SUFDekUsQ0FBQztDQUNGO0FBL0dELDBEQStHQyJ9