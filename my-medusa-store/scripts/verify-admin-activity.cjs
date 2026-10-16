/** Live audit checks. Uses one disposable subadmin; never changes existing business records. */
const fs = require("node:fs")
const assert = require("node:assert/strict")
const { randomUUID, randomBytes } = require("node:crypto")
const { Pool } = require("pg")
require("dotenv").config()
const base = "http://localhost:9000"
const stateFile = ".local-admin/activity-qa-state.json"
let checks = 0
async function request(path, { token, cookie, body, method, expected = 200 } = {}) {
  const response = await fetch(base + path, { method: method || (body === undefined ? "GET" : "POST"), headers: { "User-Agent": "OWEG activity verification", "X-Forwarded-For": "8.8.8.8", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) })
  const data = await response.json()
  assert.equal(response.status, expected, `${path}: ${data.message || "unexpected response"}`); checks++
  return { data, response }
}
const login = async (email, password) => (await request("/auth/user/emailpass", { body: { email, password } })).data.token
const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"))
const saveState = state => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 })
async function superToken() {
  const text = fs.readFileSync(".local-admin/superadmin-credentials.txt", "utf8")
  return login(text.match(/^Email: (.+)$/m)[1], text.match(/^Password: (.+)$/m)[1])
}
async function setup() {
  if (fs.existsSync(stateFile)) throw new Error("Activity fixtures already exist; run check or cleanup")
  const token = await superToken()
  const roles = (await request("/admin/access/roles", { token })).data.roles
  const role = roles.find(role => role.name === "Customers")
  assert.ok(role)
  const run = randomUUID()
  const state = { source: "oweg-activity-qa", run, email: `activity-qa-${run}@example.invalid`, password: randomBytes(18).toString("base64url"), role_id: role.id, group_name: `Activity QA ${run}` }
  saveState(state)
  const created = (await request("/admin/access/users", { token, body: { email: state.email, first_name: "Activity", last_name: "QA", role_id: role.id, password: state.password }, expected: 201 })).data
  state.user_id = created.user.id; saveState(state)
  console.log("Created one disposable Customers subadmin. Credentials are only in the ignored local fixture file.")
}
async function check() {
  const state = readState()
  const superadmin = await superToken()
  await request("/auth/user/emailpass", { body: { email: state.email, password: "wrong-password-secret-canary" }, expected: 401 })
  const token = await login(state.email, state.password)
  const session = await request("/auth/session", { token, body: {} })
  const cookie = session.response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ")
  await request("/admin/customers?q=private-query-canary-99&limit=1", { token })
  await request("/admin/orders", { token, expected: 403 })
  await request("/admin/access/activity", { token, expected: 403 })
  await request("/admin/access/activity/page-view", { cookie, body: { page_path: "/app/customers" }, expected: 202 })
  await request("/admin/access/activity/page-view", { cookie, body: { page_path: "/app/activity-log" }, expected: 202 })
  await request("/admin/access/activity/page-view", { token, body: { page_path: "/app/customers", actor_id: "spoofed", location: { latitude: 1 } }, expected: 400 })
  await request("/admin/access/activity/page-view", { token, body: { page_path: "/app/customers?password=private-query-canary-99" }, expected: 400 })
  const created = await request("/admin/customer-groups", { token, body: { name: state.group_name } })
  state.group_id = created.data.customer_group.id; saveState(state)
  await request(`/admin/customer-groups/${state.group_id}`, { token, method: "DELETE" })
  await request("/auth/session", { cookie, method: "DELETE" })
  let events
  for (let attempt = 0; attempt < 15; attempt++) {
    events = (await request(`/admin/access/activity?view=technical&actor_id=${state.user_id}&limit=100`, { token: superadmin })).data.events
    if (events.some(event => event.action === "auth.logout") && events.some(event => event.action === "auth.login_failed")) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  for (const action of ["auth.login", "auth.login_failed", "auth.session_created", "auth.logout", "page.viewed", "page.denied", "api.get", "api.post", "api.delete"]) { assert.ok(events.some(event => event.action === action), `Missing ${action}`); checks++ }
  assert.ok(events.some(event => event.path === "/admin/orders" && event.status_code === 403)); checks++
  assert.ok(events.some(event => event.path === "/admin/access/activity" && event.status_code === 403)); checks++
  assert.ok(events.every(event => event.actor_email === state.email && event.actor_role === "Customers")); checks++
  if (!process.env.ADMIN_AUDIT_TRUSTED_PROXIES) { assert.ok(events.every(event => ["127.0.0.1", "::1"].includes(event.ip_address) && event.location.source === "local")); checks++ }
  const serialized = JSON.stringify(events)
  for (const secret of [state.password, "wrong-password-secret-canary", "private-query-canary-99", state.group_name]) { assert.equal(serialized.includes(secret), false, "Request value leaked into audit"); checks++ }
  assert.ok(events.some(event => event.action === "api.post" && event.details.changed_fields.includes("name"))); checks++
  const first = (await request(`/admin/access/activity?view=technical&actor_id=${state.user_id}&limit=2`, { token: superadmin })).data
  const second = (await request(`/admin/access/activity?view=technical&actor_id=${state.user_id}&limit=2&offset=2&before=${encodeURIComponent(first.snapshot_at)}`, { token: superadmin })).data
  assert.equal(first.events.some(event => second.events.some(other => other.id === event.id)), false); checks++
  for (const [query, test] of [["category=authentication", event => event.category === "authentication"], ["category=navigation", event => event.category === "navigation"], ["result=denied", event => [401,403].includes(event.status_code)]]) {
    const result = (await request(`/admin/access/activity?view=technical&actor_id=${state.user_id}&${query}`, { token: superadmin })).data
    assert.ok(result.count > 0 && result.events.every(test)); checks++
  }
  await request("/admin/access/activity?limit=999999", { token: superadmin, expected: 400 })
  await request("/admin/access/activity?actor_id=%27%20OR%201=1--", { token: superadmin })
  console.log(`PASS ${checks} live activity checks: authentication, navigation, successful writes, denied access, identity snapshots, filters, pagination, spoof protection and secret exclusion.`)
}
async function cleanup() {
  const state = readState()
  if (state.source !== "oweg-activity-qa" || state.email !== `activity-qa-${state.run}@example.invalid`) throw new Error("Fixture guard failed")
  if (state.group_id) {
    const token = await superToken()
    const response = await fetch(`${base}/admin/customer-groups/${encodeURIComponent(state.group_id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) })
    if (response.ok) {
      const data = await response.json()
      if (data.customer_group?.name !== state.group_name) throw new Error("Test group ownership guard failed")
      await request(`/admin/customer-groups/${state.group_id}`, { token, method: "DELETE" })
    } else if (response.status !== 404) throw new Error("Unable to verify test group cleanup")
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("rds.amazonaws.com") ? { rejectUnauthorized: false } : undefined })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const owned = await client.query('SELECT id FROM "user" WHERE id=$1 AND email=$2', [state.user_id, state.email])
    if (owned.rows.length) {
      const identities = await client.query("SELECT auth_identity_id FROM provider_identity WHERE entity_id=$1 AND provider='emailpass'", [state.email])
      await client.query("DELETE FROM oweg_admin_account WHERE user_id=$1 AND kind='subadmin' AND role_id=$2", [state.user_id, state.role_id])
      await client.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [state.user_id, state.email])
      for (const identity of identities.rows) {
        await client.query("DELETE FROM provider_identity WHERE auth_identity_id=$1 AND entity_id=$2", [identity.auth_identity_id, state.email])
        await client.query("DELETE FROM auth_identity WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM provider_identity WHERE auth_identity_id=$1)", [identity.auth_identity_id])
      }
    }
    await client.query("COMMIT")
    fs.unlinkSync(stateFile)
    console.log("Removed this audit's disposable login. Audit history was retained.")
  } catch (error) { await client.query("ROLLBACK"); throw error }
  finally { client.release(); await pool.end() }
}
const mode = process.argv[2]
;(mode === "setup" ? setup() : mode === "check" ? check() : mode === "cleanup" ? cleanup() : Promise.reject(new Error("Use setup, check or cleanup"))).catch(error => { console.error(error.message); process.exitCode = 1 })
