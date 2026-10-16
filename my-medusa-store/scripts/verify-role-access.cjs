/** Temporary role fixtures for browser QA, plus a read-only API regression matrix. */
const fs = require("node:fs")
const { randomUUID, randomBytes } = require("node:crypto")
const { Pool } = require("pg")
require("dotenv").config()
const base = "http://localhost:9000"
const stateFile = ".local-admin/role-ui-audit-state.json"
const groups = [
  ["customers", "Customers", ["/admin/customers?limit=1", "/admin/customer-groups?limit=1"]],
  ["catalog", "Product head", ["/admin/products?limit=1", "/admin/product-categories?limit=1", "/admin/collections?limit=1", "/admin/price-lists?limit=1"]],
  ["orders", "Orders", ["/admin/orders?limit=1", "/admin/draft-orders?limit=1", "/admin/packet-booking?limit=1"]],
  ["returns", "Returns", ["/admin/return-requests", "/admin/return-packet-booking?limit=1"]],
  ["vendors", "Vendors", ["/admin/vendors/all", "/admin/vendors/pending"]],
  ["marketing", "Marketing", ["/admin/flash-sale", "/admin/featured-brands", "/admin/mega-menu-banners", "/admin/promotions?limit=1"]],
  ["accounting", "Accounting", ["/admin/vendor-payouts", "/admin/vendor-commission", "/admin/vendor-reports", "/admin/vendor-marketplace-tax"]],
  // Affiliate users belong to the separate affiliate portal and require its
  // own token. The Medusa Partner Admins screen uses the admins endpoint.
  ["partners", "Partner admins", ["/admin/affiliate/admins"]],
]
async function request(path, token, body, expected = 200) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) })
  const data = await response.json()
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}; ${data.message || "request failed"}`)
  return data
}
async function login(email, password) { return (await request("/auth/user/emailpass", null, { email, password })).token }
const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"))
const saveState = state => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 })

async function setup() {
  if (fs.existsSync(stateFile)) throw new Error("QA fixtures already exist. Run check or cleanup before setup.")
  const credentials = fs.readFileSync(".local-admin/superadmin-credentials.txt", "utf8")
  const token = await login(credentials.match(/^Email: (.+)$/m)[1], credentials.match(/^Password: (.+)$/m)[1])
  const state = { source: "oweg-role-ui-audit", run_id: randomUUID(), password: randomBytes(18).toString("base64url"), roles: [], accounts: [] }
  saveState(state)
  for (const [group, label] of groups) {
    const role = (await request("/admin/access/roles", token, { name: `UI QA ${group} ${state.run_id}`, responsibilities: `Temporary ${label} UI verification`, permissions: [group] }, 201)).role
    state.roles.push(role); saveState(state)
    const email = `ui-qa-${group}-${state.run_id}@example.invalid`
    const created = await request("/admin/access/users", token, { email, first_name: "UI QA", last_name: label, password: state.password, role_id: role.id }, 201)
    state.accounts.push({ group, label, email, user_id: created.user.id, role_id: role.id }); saveState(state)
  }
  console.log(JSON.stringify({ temporary_password: state.password, accounts: state.accounts.map(({ group, email }) => ({ group, email })) }, null, 2))
}
async function check() {
  const state = readState()
  let count = 0
  for (const account of state.accounts) {
    const token = await login(account.email, state.password)
    const me = await request("/admin/access/me", token)
    if (JSON.stringify(me.access.permissions) !== JSON.stringify([account.group])) throw new Error("Unexpected permissions for " + account.group)
    for (const path of groups.find(row => row[0] === account.group)[2]) { await request(path, token); count++ }
    for (const path of ["/admin/access/users", "/admin/access/roles", "/admin/access/permissions", "/admin/api-keys", "/admin/users"]) { await request(path, token, undefined, 403); count++ }
    console.log(`PASS ${account.group}: login, assigned APIs and admin-management denial`)
  }
  console.log(`PASS ${count} role-specific API checks across eight real subadmin logins`)
}
async function cleanup() {
  const state = readState()
  if (state.source !== "oweg-role-ui-audit") throw new Error("Unrecognized fixture file; refusing cleanup")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : undefined })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const targets = state.roles.map(role => role.id)
    for (const account of state.accounts) {
      if (!account.email.endsWith(`-${state.run_id}@example.invalid`)) throw new Error("Fixture email guard failed")
      const owned = await client.query('SELECT id FROM "user" WHERE id=$1 AND email=$2', [account.user_id, account.email])
      if (!owned.rows.length) continue
      const identities = await client.query("SELECT auth_identity_id FROM provider_identity WHERE entity_id=$1 AND provider='emailpass'", [account.email])
      await client.query("DELETE FROM oweg_admin_account WHERE user_id=$1 AND kind='subadmin' AND role_id=$2", [account.user_id, account.role_id])
      await client.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [account.user_id, account.email])
      for (const identity of identities.rows) {
        await client.query("DELETE FROM provider_identity WHERE auth_identity_id=$1 AND entity_id=$2", [identity.auth_identity_id, account.email])
        await client.query("DELETE FROM auth_identity WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM provider_identity WHERE auth_identity_id=$1)", [identity.auth_identity_id])
      }
      targets.push(account.user_id)
    }
    for (const role of state.roles) await client.query("DELETE FROM oweg_admin_role WHERE id=$1 AND name=$2", [role.id, role.name])
    await client.query("DELETE FROM oweg_admin_audit WHERE target_id=ANY($1::text[]) OR actor_id=ANY($1::text[])", [targets])
    await client.query("COMMIT")
    fs.unlinkSync(stateFile)
    console.log("Removed only this audit's eight temporary users, roles, identities and test audit events.")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release(); await pool.end() }
}
const mode = process.argv[2]
;(mode === "setup" ? setup() : mode === "cleanup" ? cleanup() : mode === "check" ? check() : Promise.reject(new Error("Use setup, check or cleanup"))).catch(error => { console.error(error.message); process.exitCode = 1 })
