import { test } from "node:test"
import assert from "node:assert/strict"
import { adminRoleCatalog, roleCompatibilityError, supportedRolePermissions } from "../../../shared/admin-role-catalog"
import { ADMIN_RESPONSIBILITIES } from "../../../shared/admin-responsibilities"
import { ADMIN_PERMISSION_GROUPS, validatePermissions } from "../../../shared/admin-access"
import { parseAccessInput, roleInput } from "../validation"
import { accessRequest } from "../../../admin/lib/admin-access-client"

test("every responsibility advertised by the backend is accepted by both role validators", () => {
  const catalog = adminRoleCatalog()
  for (const permission of catalog.supported_permission_ids) {
    const body = parseAccessInput(roleInput, { name: "Dispatch", permissions: [permission] })
    assert.deepEqual(validatePermissions(body.permissions), [permission])
  }
  assert.equal(catalog.supported_permission_ids.length, ADMIN_PERMISSION_GROUPS.length + ADMIN_RESPONSIBILITIES.length)
})

test("six specific responsibilities round-trip without broadening their access", () => {
  const permissions = ["orders.orders", "orders.drafts", "orders.booking", "returns.requests", "returns.booking", "customers.people"]
  const body = parseAccessInput(roleInput, { name: "dispatch2", responsibilities: "dispatch", permissions })
  assert.deepEqual(body.permissions, permissions)
  assert.equal(roleCompatibilityError(permissions, supportedRolePermissions(adminRoleCatalog())), null)
  assert.equal(body.permissions.includes("orders"), false)
})

test("an older backend never gets silently substituted broad section permissions", () => {
  const chosen = ["orders.booking", "returns.booking"]
  const supported = supportedRolePermissions(undefined)
  assert.equal(supported.includes("orders.booking"), false)
  assert.match(roleCompatibilityError(chosen, supported)!, /Deploy and restart the backend/)
  assert.deepEqual(chosen, ["orders.booking", "returns.booking"])
  assert.equal(roleCompatibilityError(["orders"], supported), null)
})

test("existing custom grants stay registered; unknown and elevated grants stay blocked", () => {
  const id = "custom_12345678-1234-1234-1234-123456789abc"
  assert.equal(roleCompatibilityError([id], supportedRolePermissions(adminRoleCatalog([id]))), null)
  assert.equal(roleCompatibilityError([id], supportedRolePermissions(undefined, [id])), null)
  for (const permission of ["superadmin", "orders.*", "access.users", "orders.secret"])
    assert.throws(() => parseAccessInput(roleInput, { name: "Bad", permissions: [permission] }), /Choose only responsibilities/)
})

test("old live-server field errors have an actionable deployment message and retain form data", async () => {
  const original = global.fetch
  const body = { name: "Dispatch", permissions: ["orders.booking"] }
  try {
    global.fetch = async () => new Response(JSON.stringify({ message: "Invalid fields: permissions.0, permissions.1" }), { status: 400, headers: { "Content-Type": "application/json" } })
    await assert.rejects(accessRequest("/roles", body), /Update and restart the Medusa backend/)
    assert.deepEqual(body.permissions, ["orders.booking"])
    global.fetch = async () => new Response(JSON.stringify({ message: "Role name already exists" }), { status: 400 })
    await assert.rejects(accessRequest("/roles", body), /Role name already exists/)
  } finally { global.fetch = original }
})
