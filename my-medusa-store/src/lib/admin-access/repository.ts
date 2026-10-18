import type { PoolClient } from "pg"
import { MedusaError } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../db-pool"
import { ADMIN_PERMISSION_GROUPS, validatePermissions, type AdminAccess, type AdminPermission, type CustomAdminPermission } from "../../shared/admin-access"
import { customPermissionInput, deleteAccountInput, parseAccessInput } from "./validation"
import { insertAdminActivity } from "./activity-store"
import { canDeleteAdminAccount } from "../../shared/admin-account-controls"

export type AdminRole = { id: string; name: string; responsibilities: string; permissions: AdminPermission[] }
export type AdminAccountRow = AdminAccess & { email: string; first_name: string | null; last_name: string | null; token_valid_after: string }

export async function getAdminAccess(userId: string): Promise<AdminAccountRow | null> {
  const { rows } = await getSharedDbPool().query(`
    SELECT u.id AS user_id, u.email, u.first_name, u.last_name,
      COALESCE(a.must_change_password, false) AS must_change_password, COALESCE(a.kind, 'unassigned') AS kind, COALESCE(a.active, false) AS active,
      a.role_id, r.name AS role_name, COALESCE(r.responsibilities, '') AS responsibilities,
      COALESCE(r.permissions, '[]'::jsonb) AS permissions, COALESCE(a.token_valid_after, 0) AS token_valid_after
    FROM "user" u
    LEFT JOIN oweg_admin_account a ON a.user_id = u.id
    LEFT JOIN oweg_admin_role r ON r.id = a.role_id
    WHERE u.id = $1 AND u.deleted_at IS NULL
  `, [userId])
  const row = rows[0]
  if (!row) return null
  const definitions = await listCustomPermissions()
  row.permissions = row.kind === "superadmin" ? [...ADMIN_PERMISSION_GROUPS.map(g => g.id), ...definitions.map(p => p.id)] : validatePermissions(row.permissions, definitions.map(p => p.id))
  row.custom_permissions = row.kind === "superadmin" ? definitions : definitions.filter(p => row.permissions.includes(p.id))
  return row
}

export function publicAccess(account: AdminAccountRow): AdminAccess {
  const { user_id, kind, active, role_id, role_name, responsibilities, permissions, custom_permissions, must_change_password } = account
  return { user_id, kind, active, role_id, role_name, responsibilities, permissions, custom_permissions, must_change_password }
}

export async function requireSuperadmin(userId: string): Promise<AdminAccountRow> {
  const access = await getAdminAccess(userId)
  if (!access?.active || access.kind !== "superadmin") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only the superadmin can manage admin accounts and permissions")
  }
  return access
}

export async function audit(client: PoolClient, actor: string, action: string, target: string, details: Record<string, unknown> = {}) {
  await insertAdminActivity(client, { actor_id: actor, action, target_id: target, details, category: "access_change" })
}

export async function accessTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getSharedDbPool().connect()
  try {
    await client.query("BEGIN")
    const result = await work(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    if ((error as { code?: string }).code === "23505") {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "An account or role with these details already exists")
    }
    throw error
  } finally { client.release() }
}

export async function listRoles(): Promise<AdminRole[]> {
  return (await getSharedDbPool().query("SELECT id, name, responsibilities, permissions FROM oweg_admin_role ORDER BY created_at, name")).rows
}

export async function listAccounts() {
  return (await getSharedDbPool().query(`
    SELECT u.id AS user_id, u.email, u.first_name, u.last_name,
      COALESCE(a.must_change_password, false) AS must_change_password, COALESCE(a.kind, 'unassigned') AS kind, COALESCE(a.active, false) AS active,
      a.role_id, r.name AS role_name, COALESCE(r.responsibilities, '') AS responsibilities,
      COALESCE(r.permissions, '[]'::jsonb) AS permissions
    FROM "user" u LEFT JOIN oweg_admin_account a ON a.user_id = u.id
    LEFT JOIN oweg_admin_role r ON r.id = a.role_id
    WHERE u.deleted_at IS NULL ORDER BY (a.kind = 'superadmin') DESC NULLS LAST, u.email
  `)).rows
}

export async function saveRole(actor: string, input: AdminRole, create: boolean) {
  await requireSuperadmin(actor)
  const definitions = await listCustomPermissions()
  let permissions: AdminPermission[]
  try { permissions = validatePermissions(input.permissions, definitions.map(p => p.id)) } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Select registered permissions")
  }
  if (!input.name?.trim() || input.name.trim().length > 100 || input.responsibilities.length > 2000) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a role name (up to 100 characters) and responsibilities (up to 2000 characters)")
  }
  return accessTransaction(async client => {
    const params = [input.id, input.name.trim(), input.responsibilities.trim(), JSON.stringify(permissions)]
    const { rows } = create
      ? await client.query("INSERT INTO oweg_admin_role (id,name,responsibilities,permissions,created_by) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id,name,responsibilities,permissions", [...params, actor])
      : await client.query("UPDATE oweg_admin_role SET name=$2,responsibilities=$3,permissions=$4::jsonb,updated_at=now() WHERE id=$1 RETURNING id,name,responsibilities,permissions", params)
    if (!rows.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Role not found")
    await audit(client, actor, create ? "role.created" : "role.updated", input.id, { name: input.name.trim(), permissions })
    return rows[0]
  })
}

export async function listCustomPermissions(): Promise<CustomAdminPermission[]> {
  return (await getSharedDbPool().query("SELECT id,name,description,page_paths,api_paths,access_mode,enabled FROM oweg_admin_permission ORDER BY created_at,name")).rows
}

export async function saveCustomPermission(actor: string, id: `custom_${string}`, body: unknown, create: boolean) {
  await requireSuperadmin(actor)
  const input = parseAccessInput(customPermissionInput, body)
  if (ADMIN_PERMISSION_GROUPS.some(group => group.label.toLowerCase() === input.name.toLowerCase())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a name different from the preset groups")
  }
  return accessTransaction(async client => {
    const values = [id, input.name, input.description, JSON.stringify([...new Set(input.page_paths)]), JSON.stringify([...new Set(input.api_paths)]), input.access_mode, input.enabled]
    const { rows } = create
      ? await client.query("INSERT INTO oweg_admin_permission (id,name,description,page_paths,api_paths,access_mode,enabled,created_by) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) RETURNING id,name,description,page_paths,api_paths,access_mode,enabled", [...values, actor])
      : await client.query("UPDATE oweg_admin_permission SET name=$2,description=$3,page_paths=$4::jsonb,api_paths=$5::jsonb,access_mode=$6,enabled=$7,updated_at=now() WHERE id=$1 RETURNING id,name,description,page_paths,api_paths,access_mode,enabled", values)
    if (!rows.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Permission not found")
    await audit(client, actor, create ? "permission.created" : "permission.updated", id, input)
    return rows[0]
  })
}

export async function assignAccount(actor: string, userId: string, roleId: string, active: boolean, mustChangePassword = false) {
  await requireSuperadmin(actor)
  return accessTransaction(async client => {
    // Serializes account changes, including concurrent password resets/provisioning.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`oweg-admin:${userId}`])
    const { rows: users } = await client.query('SELECT id FROM "user" WHERE id=$1 AND deleted_at IS NULL', [userId])
    if (!users.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Admin user not found")
    const { rows: roles } = await client.query("SELECT id FROM oweg_admin_role WHERE id=$1", [roleId])
    if (!roles.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an existing role")
    const { rows: existing } = await client.query("SELECT kind,active FROM oweg_admin_account WHERE user_id=$1 FOR UPDATE", [userId])
    if (existing[0]?.kind === "superadmin") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The superadmin is managed only through the CLI")
    await client.query(`
      INSERT INTO oweg_admin_account (user_id,kind,active,role_id,created_by,must_change_password) VALUES ($1,'subadmin',$2,$3,$4,true)
      ON CONFLICT (user_id) DO UPDATE SET active=$2,role_id=$3,updated_at=now(),
        must_change_password=oweg_admin_account.must_change_password OR $6,
        token_valid_after=CASE WHEN oweg_admin_account.active=false AND $2=true THEN $5::bigint ELSE oweg_admin_account.token_valid_after END
    `, [userId, active, roleId, actor, Math.floor(Date.now() / 1000), mustChangePassword])
    await audit(client, actor, existing.length ? "account.updated" : "account.assigned", userId, { role_id: roleId, active })
  })
}

export async function deleteAdminAccount(actor: string, userId: string, body: unknown) {
  const administrator = await requireSuperadmin(actor)
  parseAccessInput(deleteAccountInput, body)
  if (actor === userId) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "You cannot delete your own account")
  return accessTransaction(async client => {
    // Match assignment/reset locking so deletion cannot race an access change.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`oweg-admin:${userId}`])
    const { rows: users } = await client.query('SELECT id FROM "user" WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [userId])
    if (!users.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Admin user not found")
    const { rows: accounts } = await client.query("SELECT kind FROM oweg_admin_account WHERE user_id=$1 FOR UPDATE", [userId])
    if (!canDeleteAdminAccount(administrator, { user_id: userId, kind: accounts[0]?.kind || "unassigned" })) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Superadmin accounts cannot be deleted through the dashboard")
    }
    // Retain account/audit records. All admin requests and token refreshes check
    // user.deleted_at in getAdminAccess, blocking existing sessions immediately.
    await client.query('UPDATE "user" SET deleted_at=now(),updated_at=now() WHERE id=$1', [userId])
    await client.query("UPDATE oweg_admin_account SET active=false,token_valid_after=$2,updated_at=now() WHERE user_id=$1", [userId, Math.ceil(Date.now() / 1000)])
    await audit(client, actor, "account.deleted", userId)
  })
}
