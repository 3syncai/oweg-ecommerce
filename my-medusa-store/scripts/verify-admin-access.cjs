/** Live smoke test. Creates one temporary role/account and removes only those records. */
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { randomUUID } = require("node:crypto")
const { Pool } = require("pg")
require("dotenv").config()

const base = process.env.RBAC_BASE_URL || "http://localhost:9000"
const stored = !process.env.RBAC_TEST_PASSWORD ? readFileSync(".local-admin/superadmin-credentials.txt", "utf8") : ""
const adminEmail = process.env.RBAC_TEST_EMAIL || stored.match(/^Email: (.+)$/m)?.[1]
const adminPassword = process.env.RBAC_TEST_PASSWORD || stored.match(/^Password: (.+)$/m)?.[1]
const suffix = randomUUID()
const testEmail = `codex-rbac-${suffix}@example.invalid`
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : undefined })
let roleId, userId, permissionId
let checks = 0

async function request(path, { token, cookie, body, method, expected = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  })
  const data = await response.json()
  assert.equal(response.status, expected, `${method || (body === undefined ? "GET" : "POST")} ${path}: ${data.message || "unexpected status"}`)
  checks++
  return { data, response }
}

async function login(email, password) {
  return (await request("/auth/user/emailpass", { body: { email, password } })).data.token
}

async function main() {
  try {
    await request("/admin/access/me", { expected: 401 })
    const admin = await login(adminEmail, adminPassword)
    const me = (await request("/admin/access/me", { token: admin })).data.access
    assert.equal(me.kind, "superadmin")
    const roles = (await request("/admin/access/roles", { token: admin })).data.roles
    assert.equal(roles.filter(r => r.id.startsWith("arole_") && !r.id.includes("-")).length, 8)
    const createdRole = await request("/admin/access/roles", { token: admin, body: { name: `Access smoke test ${suffix}`, responsibilities: "Temporary verification account", permissions: ["customers"] }, expected: 201 })
    roleId = createdRole.data.role.id
    const created = await request("/admin/access/users", { token: admin, body: { email: testEmail, first_name: "Permission", last_name: "Smoke test", role_id: roleId }, expected: 201 })
    userId = created.data.user.id
    assert.equal(typeof created.data.credentials.password, "string")
    assert.ok(created.data.credentials.password.length >= 24)
    const sub = await login(testEmail, created.data.credentials.password)
    const session = await request("/auth/session", { token: sub, body: {} })
    const cookie = session.response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ")
    const self = (await request("/admin/access/me", { cookie })).data.access
    assert.equal(self.kind, "subadmin")
    assert.deepEqual(self.permissions, ["customers"])
    await request("/admin/users/me", { token: sub })
    await request("/admin/stores", { token: sub })
    await request("/admin/customers?limit=1", { token: sub })
    for (const path of ["/admin/orders?limit=1", "/admin/products?limit=1", "/admin/vendor-payouts", "/admin/access/users", "/admin/access/roles", "/admin/access/audit", "/admin/api-keys", "/admin/users"]) await request(path, { token: sub, expected: 403 })
    await request("/admin/access/users", { token: sub, body: { email: `blocked-${testEmail}`, role_id: roleId }, expected: 403 })
    await request("/admin/invites", { token: sub, body: { email: `blocked-${testEmail}` }, expected: 403 })
    await request(`/admin/access/users/${userId}`, { token: sub, body: { role_id: roleId, active: true }, expected: 403 })
    await request(`/admin/access/users/${userId}`, { token: admin, body: { role_id: roleId, active: true, kind: "superadmin" }, expected: 400 })
    await request(`/admin/access/users/${me.user_id}`, { token: admin, body: { role_id: roleId, active: true }, expected: 400 })
    await request(`/admin/users/${me.user_id}`, { token: admin, method: "DELETE", expected: 403 })
    await request("/admin/access/permissions", { token: sub, expected: 403 })
    const customInput = { name: `Groups smoke test ${suffix}`, description: "Temporary custom permission", page_paths: ["/customer-groups"], api_paths: ["/admin/customer-groups"], access_mode: "view", enabled: true }
    await request("/admin/access/permissions", { token: sub, body: customInput, expected: 403 })
    await request("/admin/access/permissions", { token: admin, body: { ...customInput, api_paths: ["/admin/users"] }, expected: 400 })
    await request("/admin/access/permissions", { token: admin, body: { ...customInput, page_paths: ["/admin-access"] }, expected: 400 })
    const permission = await request("/admin/access/permissions", { token: admin, body: customInput, expected: 201 })
    permissionId = permission.data.permission.id
    const options = (await request("/admin/access/permissions", { token: admin })).data.permissions
    assert.ok(options.some(item => item.id === permissionId))
    await request(`/admin/access/roles/${roleId}`, { token: admin, body: { name: `Access smoke test ${suffix}`, permissions: [permissionId] } })
    const customSelf = (await request("/admin/access/me", { token: sub })).data.access
    assert.deepEqual(customSelf.permissions, [permissionId])
    assert.ok(customSelf.custom_permissions.some(item => item.id === permissionId))
    await request("/admin/customer-groups?limit=1", { token: sub })
    await request("/admin/customers?limit=1", { token: sub, expected: 403 })
    await request("/admin/customer-groups", { token: sub, body: { name: 17 }, expected: 403 })
    await request(`/admin/access/permissions/${permissionId}`, { token: sub, body: { ...customInput, access_mode: "manage" }, expected: 403 })
    await request(`/admin/access/permissions/${permissionId}`, { token: admin, body: { ...customInput, access_mode: "manage" } })
    // Validation rejects the non-string name after permission succeeds; no business record is created.
    await request("/admin/customer-groups", { token: sub, body: { name: 17 }, expected: 400 })
    await request(`/admin/access/permissions/${permissionId}`, { token: admin, body: { ...customInput, enabled: false } })
    await request("/admin/customer-groups?limit=1", { token: sub, expected: 403 })
    await request(`/admin/access/roles/${roleId}`, { token: admin, body: { name: `Access smoke test ${suffix}`, permissions: ["custom_00000000-0000-4000-8000-000000000000"] }, expected: 400 })
    await request(`/admin/access/roles/${roleId}`, { token: admin, body: { name: `Access smoke test ${suffix}`, responsibilities: "Orders only", permissions: ["orders"] } })
    await request("/admin/orders?limit=1", { token: sub })
    await request("/admin/customers?limit=1", { token: sub }) // Read-only order-editor lookup.
    await request("/admin/customers", { token: sub, body: { email: "blocked@example.invalid" }, expected: 403 })
    await request(`/admin/access/users/${userId}`, { token: admin, body: { role_id: roleId, active: false } })
    await request("/admin/orders?limit=1", { token: sub, expected: 403 })
    assert.equal((await request("/admin/access/me", { token: sub })).data.access.active, false)
    await request(`/admin/access/users/${userId}`, { token: admin, body: { role_id: roleId, active: true } })
    const activeToken = await login(testEmail, created.data.credentials.password)
    await request("/admin/orders?limit=1", { token: activeToken })
    await new Promise(resolve => setTimeout(resolve, 1100))
    const reset = await request(`/admin/access/users/${userId}/credentials`, { token: admin, body: {} })
    await request("/admin/orders?limit=1", { token: activeToken, expected: 401 })
    const newToken = await login(testEmail, reset.data.credentials.password)
    await request("/admin/orders?limit=1", { token: newToken })
    await request(`/admin/access/users/${me.user_id}/credentials`, { token: admin, body: {}, expected: 400 })
    const audit = (await request("/admin/access/audit", { token: admin })).data.events
    assert.ok(audit.some(event => event.target_id === userId && event.action === "credentials.reset"))
    assert.ok(!JSON.stringify(audit).includes(reset.data.credentials.password))
    const dbClient = await pool.connect()
    try {
      await dbClient.query("BEGIN")
      try {
        await dbClient.query("UPDATE oweg_admin_account SET kind='superadmin',role_id=NULL WHERE user_id=$1", [userId])
        throw new Error("The singleton superadmin constraint did not reject a second account")
      } catch (error) { assert.equal(error.code, "23505") }
      await dbClient.query("ROLLBACK")
    } finally { dbClient.release() }
    console.log(`PASS: ${checks} live HTTP checks; role isolation, cookie login, immediate permission changes, disabled access, credential reset, audit safety and single-superadmin constraint verified.`)
  } finally {
    // Email check ensures cleanup cannot touch an unrelated account, even on partial failures.
    const own = await pool.query('SELECT id FROM "user" WHERE email=$1', [testEmail])
    for (const row of own.rows) {
      const identities = await pool.query("SELECT auth_identity_id FROM provider_identity WHERE entity_id=$1 AND provider='emailpass'", [testEmail])
      await pool.query("DELETE FROM oweg_admin_account WHERE user_id=$1 AND kind='subadmin'", [row.id])
      await pool.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [row.id, testEmail])
      for (const identity of identities.rows) {
        await pool.query("DELETE FROM provider_identity WHERE auth_identity_id=$1 AND entity_id=$2", [identity.auth_identity_id, testEmail])
        await pool.query("DELETE FROM auth_identity WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM provider_identity WHERE auth_identity_id=$1)", [identity.auth_identity_id])
      }
      await pool.query("DELETE FROM oweg_admin_audit WHERE target_id=$1 OR actor_id=$1", [row.id])
    }
    if (roleId) {
      await pool.query("DELETE FROM oweg_admin_role WHERE id=$1 AND name=$2", [roleId, `Access smoke test ${suffix}`])
      await pool.query("DELETE FROM oweg_admin_audit WHERE target_id=$1", [roleId])
    }
    if (permissionId) {
      await pool.query("DELETE FROM oweg_admin_permission WHERE id=$1 AND name=$2", [permissionId, `Groups smoke test ${suffix}`])
      await pool.query("DELETE FROM oweg_admin_audit WHERE target_id=$1", [permissionId])
    }
    await pool.end()
    console.log("Temporary test account and role cleaned up.")
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
