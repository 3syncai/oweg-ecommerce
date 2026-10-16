/** Read-only checks: synthetic SQL rows are never inserted into the audit table. */
require("dotenv").config()
require("ts-node/register/transpile-only")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const { Pool } = require("pg")
const { activityViewCtes } = require("../src/lib/admin-access/activity-feed")
const base = "http://localhost:9000"
let checks = 0
async function request(path, token, expected = 200, body) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  })
  const data = await response.json()
  assert.equal(
    response.status,
    expected,
    `${path}: ${data.message || response.status}`
  )
  checks++
  return data
}
async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("rds.amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined,
  })
  try {
    const rows = []
    const add = (
      id,
      seconds,
      category,
      action,
      path,
      method = null,
      status_code = 200,
      extra = {}
    ) =>
      rows.push({
        id,
        actor_id: "qa_actor",
        created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, seconds)).toISOString(),
        category,
        action,
        path,
        method,
        status_code,
        request_id: null,
        ip_address: "127.0.0.1",
        user_agent: "QA",
        ...extra,
      })
    add(
      "login",
      0,
      "authentication",
      "auth.login",
      "/auth/user/emailpass",
      "POST"
    )
    add(
      "session",
      1,
      "authentication",
      "auth.session_created",
      "/auth/session",
      "POST"
    )
    add("read", 2, "api", "api.get", "/admin/customers", "GET")
    add("visit1", 3, "navigation", "page.viewed", "/app/customers")
    add("poll", 4, "api", "api.get", "/admin/customers", "GET")
    add("visit2", 5, "navigation", "page.viewed", "/app/customers")
    add(
      "other-admin",
      4,
      "navigation",
      "page.viewed",
      "/app/customers",
      null,
      200,
      { actor_id: "qa_other" }
    )
    add("write", 6, "api", "api.post", "/admin/customer-groups", "POST")
    add("after-write", 7, "navigation", "page.viewed", "/app/customers")
    add("after-gap", 80, "navigation", "page.viewed", "/app/customers")
    add(
      "calculation",
      81,
      "api",
      "api.post",
      "/admin/vendor-payouts/calculate",
      "POST"
    )
    add("background-denial", 82, "api", "api.get", "/admin/orders", "GET", 403)
    add("role", 83, "access_change", "role.created", null, null, null, {
      request_id: "same_request",
    })
    add(
      "duplicate-role",
      84,
      "api",
      "api.post",
      "/admin/access/roles",
      "POST",
      200,
      { request_id: "same_request" }
    )
    add(
      "failed-role-response",
      85,
      "api",
      "api.post",
      "/admin/access/roles",
      "POST",
      500,
      { request_id: "same_request" }
    )
    add(
      "logout",
      86,
      "authentication",
      "auth.logout",
      "/auth/session",
      "DELETE"
    )
    add("denied-write", 87, "api", "api.post", "/admin/customers", "POST", 403)
    add(
      "new-ip",
      88,
      "navigation",
      "page.viewed",
      "/app/customers",
      null,
      200,
      { ip_address: "192.168.1.3" }
    )
    const fixture = `WITH audit_snapshot AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS a(id text,actor_id text,created_at timestamptz,category text,action text,path text,method text,status_code int,request_id text,ip_address text,user_agent text))`
    const clean = (
      await pool.query(
        `${fixture}, ${activityViewCtes("activity")} SELECT * FROM activity_events ORDER BY created_at,id`,
        [JSON.stringify(rows)]
      )
    ).rows
    const raw = (
      await pool.query(
        `${fixture}, ${activityViewCtes("technical")} SELECT * FROM activity_events`,
        [JSON.stringify(rows)]
      )
    ).rows
    assert.equal(raw.length, rows.length)
    checks++
    assert.deepEqual(
      clean.map((row) => row.id),
      [
        "login",
        "other-admin",
        "visit2",
        "write",
        "after-write",
        "after-gap",
        "role",
        "failed-role-response",
        "logout",
        "denied-write",
        "new-ip",
      ]
    )
    checks++
    assert.equal(clean.find((row) => row.id === "visit2").repeat_count, 2)
    checks++
    assert.equal(
      clean.find((row) => row.id === "visit2").first_occurred_at.toISOString(),
      rows.find((row) => row.id === "visit1").created_at
    )
    checks++
    assert.ok(
      clean
        .filter((row) => row.category !== "navigation")
        .every((row) => row.repeat_count === 1)
    )
    checks++
    const credentials = fs.readFileSync(
      ".local-admin/superadmin-credentials.txt",
      "utf8"
    )
    const token = (
      await request("/auth/user/emailpass", null, 200, {
        email: credentials.match(/^Email: (.+)$/m)[1],
        password: credentials.match(/^Password: (.+)$/m)[1],
      })
    ).token
    const first = await request("/admin/access/activity?limit=10", token)
    assert.equal(first.view, "activity")
    checks++
    const technical = await request(
      `/admin/access/activity?view=technical&before=${encodeURIComponent(first.snapshot_at)}&limit=100`,
      token
    )
    assert.ok(technical.count > first.count)
    checks++
    assert.ok(
      technical.events.some(
        (event) =>
          event.category === "api" && ["GET", "HEAD"].includes(event.method)
      )
    )
    checks++
    assert.ok(
      first.events.every(
        (event) =>
          !(
            event.category === "api" && ["GET", "HEAD"].includes(event.method)
          ) && event.action !== "auth.session_created"
      )
    )
    checks++
    const second = await request(
      `/admin/access/activity?limit=10&offset=10&before=${encodeURIComponent(first.snapshot_at)}`,
      token
    )
    assert.equal(second.count, first.count)
    checks++
    assert.ok(
      !second.events.some((event) =>
        first.events.some((prior) => prior.id === event.id)
      )
    )
    checks++
    for (const view of ["activity", "technical"]) {
      const auth = await request(
        `/admin/access/activity?view=${view}&category=authentication`,
        token
      )
      assert.ok(
        auth.events.every((event) => event.category === "authentication")
      )
      checks++
      const filtered = await request(
        `/admin/access/activity?view=${view}&q=customer%40oweg.com`,
        token
      )
      assert.ok(
        filtered.events.every(
          (event) => event.actor_email === "customer@oweg.com"
        )
      )
      checks++
    }
    await request("/admin/access/activity?view=invalid", token, 400)
    const stored = fs
      .readFileSync(".local-admin/subadmin-credentials.txt", "utf8")
      .split(/\r?\n/)
      .find((line) => line.startsWith("customer@oweg.com | "))
      .split(" | ")
    const sub = (
      await request("/auth/user/emailpass", null, 200, {
        email: stored[0],
        password: stored[1],
      })
    ).token
    await request("/admin/access/activity", sub, 403)
    await request("/admin/access/activity?view=technical", sub, 403)
    console.log(
      `PASS ${checks} activity feed checks: noise filtering, grouping, cross-admin isolation, duplicate suppression, failed writes, raw retention, pagination, filters and superadmin-only access. No history was modified.`
    )
  } finally {
    await pool.end()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
