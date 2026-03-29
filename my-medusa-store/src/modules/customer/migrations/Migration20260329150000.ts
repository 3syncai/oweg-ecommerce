import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260329150000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_login_otp_code" (
        "id" text NOT NULL,
        "customer_id" text NOT NULL,
        "auth_identity_id" text NOT NULL,
        "otp_hash" text NOT NULL,
        "email_hash" text NOT NULL,
        "request_ip_hash" text NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_attempt_at" timestamptz NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "invalidated_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "customer_login_otp_code_pkey" PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_login_otp_code_hash"
      ON "customer_login_otp_code" ("otp_hash");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_login_otp_code_customer"
      ON "customer_login_otp_code" ("customer_id");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_login_otp_code_email_hash"
      ON "customer_login_otp_code" ("email_hash");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_login_otp_code_expires_at"
      ON "customer_login_otp_code" ("expires_at");
    `)

    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_login_otp_audit" (
        "id" text NOT NULL,
        "event_type" text NOT NULL,
        "email_hash" text NULL,
        "ip_hash" text NULL,
        "otp_hash" text NULL,
        "customer_id" text NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "customer_login_otp_audit_pkey" PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_login_otp_audit_event_created"
      ON "customer_login_otp_audit" ("event_type", "created_at");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_login_otp_audit_email_created"
      ON "customer_login_otp_audit" ("email_hash", "created_at");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_login_otp_audit_ip_created"
      ON "customer_login_otp_audit" ("ip_hash", "created_at");
    `)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "customer_login_otp_audit" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "customer_login_otp_code" CASCADE;`)
  }
}
