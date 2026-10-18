import { test } from "node:test"
import assert from "node:assert/strict"
import { adminLoginEmail, adminLoginId, resolveAdminLoginId, scopeAdminLogin } from "../admin-auth"
import { createAdminIdentity } from "../provisioning"
import { generateJwtToken } from "@medusajs/framework/utils"

test("admin credentials use an internal key while the displayed email stays normal", () => {
  assert.equal(adminLoginId(" Person@Example.test "), "oweg-admin:person@example.test")
  assert.equal(adminLoginEmail(adminLoginId("person@example.test")), "person@example.test")
  assert.equal(adminLoginEmail("person@example.test"), "person@example.test")
  assert.throws(() => adminLoginId("oweg-admin:person@example.test"))
})

test("legacy admin-only identities move without replacing password hashes; customer/vendor identities never move", async () => {
  for (const metadata of [{ user_id: "user_admin" }, { customer_id: "cus_1" }, { vendor_id: "vendor_1" }, { user_id: "user_admin", customer_id: "cus_1" }]) {
    const updates: unknown[] = []
    const auth = {
      listProviderIdentities: async (filter: any) => filter.entity_id.startsWith("oweg-admin:") ? [] : [{ id: "provider_legacy", auth_identity_id: "identity_legacy" }],
      retrieveAuthIdentity: async () => ({ app_metadata: metadata }),
      updateProviderIdentities: async (input: unknown) => { updates.push(input) },
    }
    assert.equal(await resolveAdminLoginId({ resolve: () => auth } as any, "person@example.test"), "oweg-admin:person@example.test")
    assert.deepEqual(updates, "user_id" in metadata && !("customer_id" in metadata) ? [{ id: "provider_legacy", entity_id: "oweg-admin:person@example.test" }] : [])
  }
})

test("HTTP scoping affects only admin sign-in/reset and refuses public admin registration", async () => {
  const auth = { listProviderIdentities: async () => [{ id: "scoped" }] }
  for (const [path, field, expected] of [
    ["/auth/user/emailpass", "email", "oweg-admin:person@example.test"],
    ["/auth/user/emailpass/reset-password", "identifier", "oweg-admin:person@example.test"],
    ["/auth/customer/emailpass", "email", "person@example.test"],
    ["/auth/customer/emailpass/register", "email", "person@example.test"],
    ["/auth/customer/emailpass/reset-password", "identifier", "person@example.test"],
  ]) {
    const req = { method: "POST", originalUrl: path, body: { [field]: "person@example.test" }, validatedBody: { [field]: "person@example.test" }, scope: { resolve: () => auth } }
    let error: unknown
    await scopeAdminLogin(req as any, {} as any, value => { error = value })
    assert.equal(error, undefined)
    assert.equal(req.body[field], expected)
    assert.equal(req.validatedBody[field], expected)
  }
  let status = 0
  await scopeAdminLogin({ method: "POST", originalUrl: "/auth/user/emailpass/register" } as any, { status: (code: number) => { status = code; return { json: () => {} } } } as any, () => assert.fail("Public admin registration allowed"))
  assert.equal(status, 403)
})

test("creating an admin with a customer email registers a separate identity and never updates customer credentials", async () => {
  const calls: unknown[] = []
  const auth = {
    listProviderIdentities: async () => [],
    register: async (_provider: string, data: any) => { calls.push(data); return { success: true, authIdentity: { id: "admin_identity", app_metadata: {} } } },
    updateAuthIdentities: async (data: unknown) => { calls.push(data) },
  }
  const users = { listUsers: async () => [], createUsers: async () => ({ id: "user_new", email: "person@example.test" }) }
  const result = await createAdminIdentity({ resolve: (key: string) => key === "auth" ? auth : users } as any, { email: "person@example.test", password: "Admin-Only-2026!" })
  assert.equal(result.identityId, "admin_identity")
  assert.deepEqual(calls, [{ body: { email: "oweg-admin:person@example.test", password: "Admin-Only-2026!" } }, { id: "admin_identity", app_metadata: { user_id: "user_new" } }])
})

test("admin reset submissions reject customer identities and pre-separation reset tokens", async () => {
  const secret = "isolated-unit-test-secret"
  for (const [actorType, entityId, allowed] of [
    ["user", "person@example.test", false],
    ["customer", "oweg-admin:person@example.test", false],
    ["user", "oweg-admin:person@example.test", true],
  ] as const) {
    const token = generateJwtToken({ actor_type: actorType, entity_id: entityId }, { secret, expiresIn: "15m" })
    let status = 200, continued = false
    await scopeAdminLogin({ method: "POST", originalUrl: "/auth/user/emailpass/update", headers: { authorization: `Bearer ${token}` }, scope: { resolve: () => ({ projectConfig: { http: { jwtSecret: secret } } }) } } as any,
      { status: (code: number) => { status = code; return { json: () => {} } } } as any,
      error => { assert.equal(error, undefined); continued = true })
    assert.equal(status, allowed ? 200 : 401)
    assert.equal(continued, allowed)
  }
})
