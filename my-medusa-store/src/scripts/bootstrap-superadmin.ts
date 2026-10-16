import type { ExecArgs, IAuthModuleService, IUserModuleService } from "@medusajs/types"
import { Modules } from "@medusajs/framework/utils"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ADMIN_PERMISSION_GROUPS } from "../shared/admin-access"
import { getSharedDbPool } from "../lib/db-pool"
import { migrateAdminAccess } from "../lib/admin-access/schema"
import { audit } from "../lib/admin-access/repository"
import { adminPassword, createAdminIdentity } from "../lib/admin-access/provisioning"

/** Promote one existing admin, or create one with a strong initial password. CLI only. */
export default async function bootstrapSuperadmin({ container }: ExecArgs) {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set SUPERADMIN_EMAIL to the intended superadmin email")
  const users = container.resolve<IUserModuleService>(Modules.USER)
  const matches = await users.listUsers({ email })
  if (matches.length > 1) throw new Error("Multiple admin users have this email. Resolve the duplicate before bootstrapping.")
  const initialPassword = !matches.length ? adminPassword(process.env.SUPERADMIN_PASSWORD) : undefined

  const pool = getSharedDbPool()
  const client = await pool.connect()
  let created: Awaited<ReturnType<typeof createAdminIdentity>> | undefined
  let committed = false
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('oweg-superadmin-bootstrap'))")
    await migrateAdminAccess(client)
    // Release the foreign-key DDL lock before Medusa creates a user on its own connection.
    await client.query("COMMIT")
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('oweg-superadmin-bootstrap'))")
    const existing = await client.query("SELECT a.user_id,u.email FROM oweg_admin_account a JOIN \"user\" u ON u.id=a.user_id WHERE a.kind='superadmin'")
    if (existing.rows.length && existing.rows[0].email.toLowerCase() !== email) throw new Error("A different superadmin already exists. A second superadmin cannot be created.")
    if (!matches.length) created = await createAdminIdentity(container, { email, password: initialPassword! })
    const user = matches[0] || created!.user
    for (const group of ADMIN_PERMISSION_GROUPS) {
      await client.query(`INSERT INTO oweg_admin_role (id,name,responsibilities,permissions,created_by)
        VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (id) DO NOTHING`,
        [`arole_${group.id}`, group.label, group.description, JSON.stringify([group.id]), user.id])
    }
    await client.query(`INSERT INTO oweg_admin_account (user_id,kind,active,role_id,created_by)
      VALUES ($1,'superadmin',true,NULL,'cli')
      ON CONFLICT (user_id) DO UPDATE SET kind='superadmin',active=true,role_id=NULL,updated_at=now()`, [user.id])
    await audit(client, user.id, "superadmin.bootstrapped", user.id, { source: "cli" })
    await client.query("COMMIT")
    committed = true
    if (created) {
      const credentialDir = join(process.cwd(), ".local-admin")
      mkdirSync(credentialDir, { recursive: true })
      const credentialFile = join(credentialDir, "superadmin-credentials.txt")
      writeFileSync(credentialFile, `Medusa Admin: http://localhost:9000/app\nEmail: ${email}\nPassword: ${initialPassword}\n\nKeep these credentials private. This file is excluded from Git.\n`, { mode: 0o600 })
      console.log(`New superadmin credentials saved locally to ${credentialFile}`)
    }
    console.log(`Superadmin ready: ${email}. ${created ? "New account created." : "Existing credentials are unchanged."} Open /app/admin-access to manage subadmins.`)
  } catch (error) {
    if (!committed) await client.query("ROLLBACK")
    if (created && !committed) {
      await container.resolve<IAuthModuleService>(Modules.AUTH).deleteAuthIdentities([created.identityId])
      await users.deleteUsers([created.user.id])
    }
    throw error
  } finally { client.release(); await pool.end() }
}
