import type { PoolClient } from "pg"

/** Only executed by the explicit CLI bootstrap/migration, never by HTTP requests. */
export async function migrateAdminAccess(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS oweg_admin_permission (
      id text PRIMARY KEY,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      page_paths jsonb NOT NULL CHECK (jsonb_typeof(page_paths) = 'array'),
      api_paths jsonb NOT NULL CHECK (jsonb_typeof(api_paths) = 'array'),
      access_mode text NOT NULL CHECK (access_mode IN ('view', 'manage')),
      enabled boolean NOT NULL DEFAULT true,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS oweg_admin_permission_name ON oweg_admin_permission(lower(name));
    CREATE TABLE IF NOT EXISTS oweg_admin_role (
      id text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      responsibilities text NOT NULL DEFAULT '',
      permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS oweg_admin_account (
      user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
      kind text NOT NULL CHECK (kind IN ('superadmin', 'subadmin')),
      active boolean NOT NULL DEFAULT true,
      role_id text REFERENCES oweg_admin_role(id) ON DELETE RESTRICT,
      created_by text NOT NULL,
      token_valid_after bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((kind = 'superadmin' AND role_id IS NULL AND active = true) OR kind = 'subadmin')
    );
    ALTER TABLE oweg_admin_account ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
    -- Keep one primary superadmin and allow one explicitly provisioned CLI test account.
    DROP INDEX IF EXISTS oweg_single_superadmin;
    CREATE UNIQUE INDEX oweg_single_superadmin ON oweg_admin_account(kind)
      WHERE kind = 'superadmin' AND created_by <> 'cli-testing';
    CREATE UNIQUE INDEX IF NOT EXISTS oweg_single_test_superadmin ON oweg_admin_account(kind)
      WHERE kind = 'superadmin' AND created_by = 'cli-testing';
    CREATE TABLE IF NOT EXISTS oweg_admin_audit (
      id text PRIMARY KEY,
      actor_id text NOT NULL,
      action text NOT NULL,
      target_id text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS oweg_admin_audit_created ON oweg_admin_audit(created_at DESC);
    ALTER TABLE oweg_admin_audit
      ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'access_change',
      ADD COLUMN IF NOT EXISTS actor_email text,
      ADD COLUMN IF NOT EXISTS actor_name text,
      ADD COLUMN IF NOT EXISTS actor_role text,
      ADD COLUMN IF NOT EXISTS actor_kind text,
      ADD COLUMN IF NOT EXISTS request_id text,
      ADD COLUMN IF NOT EXISTS method text,
      ADD COLUMN IF NOT EXISTS path text,
      ADD COLUMN IF NOT EXISTS status_code integer,
      ADD COLUMN IF NOT EXISTS duration_ms integer,
      ADD COLUMN IF NOT EXISTS ip_address text,
      ADD COLUMN IF NOT EXISTS user_agent text,
      ADD COLUMN IF NOT EXISTS location jsonb NOT NULL DEFAULT '{"source":"unavailable"}'::jsonb;
    CREATE INDEX IF NOT EXISTS oweg_admin_audit_actor_created ON oweg_admin_audit(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS oweg_admin_audit_category_created ON oweg_admin_audit(category, created_at DESC);
  `)
}
