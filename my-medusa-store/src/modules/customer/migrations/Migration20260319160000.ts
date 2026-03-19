import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260319160000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_password_reset_token" (
        "id" text NOT NULL,
        "customer_id" text NOT NULL,
        "token_hash" text NOT NULL,
        "email_hash" text NOT NULL,
        "request_ip_hash" text NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_attempt_at" timestamptz NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "invalidated_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "customer_password_reset_token_pkey" PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_password_reset_token_hash"
      ON "customer_password_reset_token" ("token_hash");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_password_reset_token_customer"
      ON "customer_password_reset_token" ("customer_id");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_password_reset_token_expires_at"
      ON "customer_password_reset_token" ("expires_at");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_password_reset_token_email_hash"
      ON "customer_password_reset_token" ("email_hash");
    `)

    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_password_reset_audit" (
        "id" text NOT NULL,
        "event_type" text NOT NULL,
        "email_hash" text NULL,
        "ip_hash" text NULL,
        "token_hash" text NULL,
        "customer_id" text NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "customer_password_reset_audit_pkey" PRIMARY KEY ("id")
      );
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_password_reset_audit_event_created"
      ON "customer_password_reset_audit" ("event_type", "created_at");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_password_reset_audit_email_created"
      ON "customer_password_reset_audit" ("email_hash", "created_at");
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_password_reset_audit_ip_created"
      ON "customer_password_reset_audit" ("ip_hash", "created_at");
    `)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "customer_password_reset_audit" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "customer_password_reset_token" CASCADE;`)
  }
}
