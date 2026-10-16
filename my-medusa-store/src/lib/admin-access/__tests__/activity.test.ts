import { test } from "node:test"
import assert from "node:assert/strict"
import { activityLocation, activityResourceId, changedActivityFields, clientActivityIp, normalizedIp, requestActivityContext, safeActivityPath } from "../activity-context"
import { canAccessAdminPage, validCustomPermissionPath, type AdminAccess } from "../../../shared/admin-access"
import { canAccessAdminApi } from "../policy"

test("activity ignores forged forwarding headers from an untrusted peer", () => {
  assert.equal(clientActivityIp("127.0.0.1", "8.8.8.8", ""), "127.0.0.1")
  assert.equal(clientActivityIp("9.9.9.9", "8.8.8.8", "10.0.0.0/8"), "9.9.9.9")
  assert.equal(clientActivityIp("9.9.9.9", "8.8.8.8", "invalid/999"), "9.9.9.9")
})
test("trusted proxy chains stop at the first untrusted hop", () => {
  assert.equal(clientActivityIp("10.0.0.1", "203.0.113.5, 8.8.8.8, 10.0.0.2", "10.0.0.0/8"), "8.8.8.8")
  assert.equal(clientActivityIp("::1", "8.8.8.8", "::1/128"), "8.8.8.8")
  assert.equal(clientActivityIp("10.0.0.1", "invalid, 8.8.8.8", "10.0.0.0/8"), "10.0.0.1")
})
test("local and reserved IPs never receive fabricated geolocation", () => {
  assert.equal(normalizedIp("::ffff:127.0.0.1"), "127.0.0.1")
  for (const ip of ["127.0.0.1", "192.168.1.4", "10.1.2.3", "172.16.0.1", "::1", "fd00::1", "2001:db8::1"]) assert.deepEqual(activityLocation(ip), { source: "local" }, ip)
  assert.deepEqual(activityLocation(null), { source: "unavailable" })
})
test("public IP geolocation uses the bundled offline database", () => {
  const location = activityLocation("8.8.8.8")
  assert.equal(location.source, "offline_ip")
  assert.equal(typeof location.country, "string")
  assert.equal(typeof location.latitude, "number")
  assert.equal(typeof location.longitude, "number")
})
test("query strings, fragment secrets and request values are excluded", () => {
  assert.equal(safeActivityPath("/admin/products?q=private-email&token=secret#credentials"), "/admin/products")
  const fields = changedActivityFields({ name: "private", metadata: { secret: "hidden" }, password: "secret", access_token: "secret", authorization: "secret", bank_account_no: "secret", card_number: "secret", "bad\nname": "x" })
  assert.deepEqual(fields, ["name", "metadata"])
  assert.equal(JSON.stringify(fields).includes("private"), false)
})
test("request context uses its server request id and strips user-agent control characters", () => {
  const context = requestActivityContext({ headers: { "x-request-id": "forged", "x-forwarded-for": "8.8.8.8", "user-agent": "Browser\nInjected" }, socket: { remoteAddress: "127.0.0.1" } }, "server-generated")
  assert.equal(context.request_id, "server-generated")
  assert.equal(context.user_agent, "BrowserInjected")
})
test("write targets retain only recognized resource ids, never credentials or response contents", () => {
  assert.equal(activityResourceId({ customer_group: { id: "cusgroup_123", name: "private" }, credentials: { password: "secret" } }), "cusgroup_123")
  assert.equal(activityResourceId({ credentials: { id: "secret", password: "secret" }, token: "secret" }), null)
  assert.equal(activityResourceId({ user: { id: "bad\nvalue" } }), null)
})
test("activity history cannot be delegated, including through tampered broad custom grants", () => {
  const sub: AdminAccess = { user_id: "sub", active: true, kind: "subadmin", role_id: "role", role_name: "All", responsibilities: "", permissions: ["custom_all"], custom_permissions: [{ id: "custom_all", name: "Tampered", enabled: true, description: "", access_mode: "manage", api_paths: ["/admin"], page_paths: ["/activity-log"] }] }
  assert.equal(canAccessAdminPage(sub, "/app/activity-log"), false)
  for (const method of ["GET", "POST", "DELETE"]) assert.equal(canAccessAdminApi(sub, method, "/admin/access/activity"), false)
  assert.equal(validCustomPermissionPath("/activity-log", "page"), false)
  assert.equal(validCustomPermissionPath("/admin/access/activity", "api"), false)
  assert.equal(canAccessAdminPage({ ...sub, kind: "superadmin" }, "/app/activity-log"), true)
})
