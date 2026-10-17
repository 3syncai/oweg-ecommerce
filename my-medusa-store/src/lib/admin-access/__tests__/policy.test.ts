import { test } from "node:test"
import assert from "node:assert/strict"
import { ADMIN_PERMISSION_GROUPS, canAccessAdminPage, validatePermissions, validCustomPermissionPath, type AdminAccess, type AdminPermission, type CustomAdminPermission } from "../../../shared/admin-access"
import { adminApiPath, canAccessAdminApi, canServiceKeyAccess, requiredAdminPermission } from "../policy"
import { accountInput, assignmentInput, credentialInput, roleInput, customPermissionInput } from "../validation"

const account = (permissions: AdminPermission[] = []): AdminAccess => ({ user_id: "user_sub", kind: "subadmin", active: true, role_id: "role", role_name: "Test", responsibilities: "", permissions })
const examples: Array<[AdminPermission, string]> = [["customers", "/admin/customers"], ["catalog", "/admin/products"], ["orders", "/admin/orders"], ["returns", "/admin/return-requests"], ["vendors", "/admin/vendors"], ["marketing", "/admin/flash-sale"], ["accounting", "/admin/vendor-payouts"], ["partners", "/admin/affiliate/admins"]]
test('payment health and retry controls are reserved for the superadmin',()=>{
  const sub=account(ADMIN_PERMISSION_GROUPS.map(group=>group.id));
  assert.equal(canAccessAdminPage(sub,'/payment-health'),false);
  assert.equal(canAccessAdminApi(sub,'POST','/admin/payment-health'),false);
  assert.equal(validCustomPermissionPath('/payment-health','page'),false);
  assert.equal(validCustomPermissionPath('/admin/payment-health','api'),false);
  assert.equal(canAccessAdminPage({...sub,kind:'superadmin'},'/payment-health'),true);
});

for (const [permission, endpoint] of examples) {
  test(`${permission}: may manage its own area and cannot modify the other seven`, () => {
    assert.equal(canAccessAdminApi(account([permission]), "POST", endpoint), true)
    for (const [other, route] of examples) {
      if (other !== permission) assert.equal(canAccessAdminApi(account([permission]), "POST", route), false, route)
    }
  })
}
test("subadmins with all eight groups still cannot create users, grant access or create API keys", () => {
  const sub = account(ADMIN_PERMISSION_GROUPS.map(g => g.id))
  for (const route of ["/admin/access/users", "/admin/access/roles", "/admin/access/audit", "/admin/users", "/admin/users/user_super", "/admin/invites", "/admin/api-keys", "/admin/workflows", "/admin/custom", "/admin/something-new"]) {
    for (const method of ["GET", "POST", "DELETE"]) assert.equal(canAccessAdminApi(sub, method, route), false, `${method} ${route}`)
  }
  assert.equal(canAccessAdminPage(sub, "/app/admin-access"), false)
  assert.equal(canAccessAdminPage(sub, "/app/settings/users"), false)
})
test("unassigned and disabled accounts have no business access even with saved permissions", () => {
  for (const sub of [{ ...account(["orders"]), active: false }, { ...account(["orders"]), kind: "unassigned" as const }]) {
    assert.equal(canAccessAdminApi(sub, "GET", "/admin/orders"), false)
    assert.equal(canAccessAdminPage(sub, "/app/orders"), false)
    assert.equal(canAccessAdminPage(sub, "/app/my-access"), true)
  }
})
test("superadmin has full API access and can open Inventory", () => {
  const superadmin = { ...account(), kind: "superadmin" as const }
  assert.equal(canAccessAdminApi(superadmin, "POST", "/admin/access/users"), true)
  assert.equal(canAccessAdminApi(superadmin, "GET", "/admin/unknown"), true)
  assert.equal(canAccessAdminPage(superadmin, "/app/admin-access"), true)
  assert.equal(canAccessAdminPage(superadmin, "/app/inventory"), true)
  assert.equal(canAccessAdminPage(superadmin, "/app/inventory/item_1"), true)
  assert.equal(canAccessAdminPage({ ...superadmin, active: false }, "/app/inventory"), false)
})
test("Inventory is absent from all eight role destinations", () => {
  assert.equal(ADMIN_PERMISSION_GROUPS.length, 8)
  assert.equal(ADMIN_PERMISSION_GROUPS.some(g => g.paths.some(p => p === "/inventory" as string)), false)
  for (const group of ADMIN_PERMISSION_GROUPS) {
    assert.equal(canAccessAdminPage(account([group.id]), "/app/inventory"), false)
    assert.equal(canAccessAdminPage(account([group.id]), "/app/inventory/item_1"), false)
  }
})
test("UI allows only the assigned sections, with strict path boundaries", () => {
  assert.equal(canAccessAdminPage(account(["customers"]), "/app/customer-groups/group_1"), true)
  assert.equal(canAccessAdminPage(account(["customers"]), "/app/customer-groups-evil"), false)
  assert.equal(canAccessAdminPage(account(["customers"]), "/app/orders"), false)
  assert.equal(canAccessAdminPage(account(["customers"]), "/app/settings/profile"), true)
  assert.equal(canAccessAdminPage(null, "/app/customers"), false)
})
test("accounting subresources cannot be changed by vendor/order admins", () => {
  for (const permission of ["vendors", "orders"] as const) {
    assert.equal(canAccessAdminApi(account([permission]), "POST", "/admin/vendors/v1/commission"), false)
    assert.equal(canAccessAdminApi(account([permission]), "POST", "/admin/orders/o1/cancel-payout"), false)
  }
  assert.equal(canAccessAdminApi(account(["accounting"]), "POST", "/admin/vendors/v1/commission"), true)
  assert.equal(requiredAdminPermission("/admin/vendor-reports"), "accounting")
})
test("editor lookup dependencies are read-only", () => {
  const orders = account(["orders"])
  assert.equal(canAccessAdminApi(orders, "GET", "/admin/products"), true)
  assert.equal(canAccessAdminApi(orders, "POST", "/admin/products"), false)
  assert.equal(canAccessAdminApi(orders, "GET", "/admin/regions"), true)
  assert.equal(canAccessAdminApi(orders, "POST", "/admin/regions"), false)
  assert.equal(canAccessAdminApi(account(["accounting"]), "GET", "/admin/vendors/v1/commission"), true)
})

test("order details can read their native context but cannot perform Returns actions", () => {
  const orders = account(["orders"])
  for (const path of ["/admin/plugins", "/admin/refund-reasons", "/admin/returns", "/admin/claims", "/admin/exchanges"]) {
    assert.equal(canAccessAdminApi(orders, "GET", path), true, path)
    assert.equal(canAccessAdminApi(orders, "POST", path), false, path)
  }
  assert.equal(canAccessAdminApi(orders, "GET", "/admin/return-requests/request_1"), false)
  for (const action of ["returns", "returns/ret_1/receive", "claims", "exchanges"]) assert.equal(canAccessAdminPage(orders, `/app/orders/order_1/${action}`), false)
  assert.equal(canAccessAdminPage(account(["orders", "returns"]), "/app/orders/order_1/returns"), true)
  assert.equal(canAccessAdminPage(orders, "/app/orders/order_1/email"), true)
})
test("service API keys can serve checkout, but can never manage admin accounts or roles", () => {
  assert.equal(canServiceKeyAccess("POST", "/admin/draft-orders"), true)
  assert.equal(canServiceKeyAccess("POST", "/admin/payments/p1/capture"), true)
  for (const route of ["/admin/access/me", "/admin/access/users", "/admin/access/roles", "/admin/users", "/admin/invites", "/admin/api-keys", "/admin/unknown"]) assert.equal(canServiceKeyAccess("POST", route), false, route)
})
test("malformed/encoded paths cannot turn a restricted request into a broad grant", () => {
  assert.equal(adminApiPath("/admin/vendors/v1%2Fcommission/?x=1"), "/admin/vendors/v1/commission")
  assert.equal(canAccessAdminApi(account(["vendors"]), "POST", adminApiPath("/admin/vendors/v1%2Fcommission")), false)
  assert.equal(canAccessAdminApi(account(["orders"]), "POST", adminApiPath("/admin/%ZZ")), false)
  assert.equal(canAccessAdminApi(account(["catalog"]), "GET", "/admin/products-other"), false)
})
test("permission input rejects privilege markers, unknown names, invalid types and duplicates normalize", () => {
  for (const invalid of [["superadmin"], ["*"], ["users"], ["catalog", "invented"], "orders", null]) assert.throws(() => validatePermissions(invalid))
  assert.deepEqual(validatePermissions(["orders", "orders"]), ["orders"])
})
test("web inputs cannot request a superadmin account or tamper with permission ownership", () => {
  const valid = { email: "staff@example.com", role_id: "arole_orders" }
  assert.equal(accountInput.safeParse(valid).success, true)
  for (const field of ["kind", "is_superadmin", "permissions", "metadata", "user_id"]) assert.equal(accountInput.safeParse({ ...valid, [field]: "superadmin" }).success, false)
  assert.equal(assignmentInput.safeParse({ role_id: "arole_orders", active: true, kind: "superadmin" }).success, false)
  assert.equal(roleInput.safeParse({ name: "Elevated", permissions: ["superadmin"] }).success, false)
  assert.equal(roleInput.safeParse({ name: "Elevated", permissions: ["orders"], kind: "superadmin" }).success, false)
  assert.equal(credentialInput.safeParse({ password: "short" }).success, false)
})

const custom: CustomAdminPermission = { id: "custom_10000000-0000-4000-8000-000000000001", name: "Groups only", description: "Manage customer groups separately", page_paths: ["/customer-groups"], api_paths: ["/admin/customer-groups"], access_mode: "view", enabled: true }
const customAccount = (definition = custom): AdminAccess => ({ ...account([definition.id]), custom_permissions: [definition] })

test("registered custom permissions are available without changing the eight preset groups", () => {
  assert.deepEqual(validatePermissions(["orders", custom.id], [custom.id]), ["orders", custom.id])
  assert.throws(() => validatePermissions([custom.id]))
  assert.equal(ADMIN_PERMISSION_GROUPS.length, 8)
  const { id, ...input } = custom
  assert.equal(customPermissionInput.safeParse(input).success, true)
})
test("custom permissions grant just the configured page and API section", () => {
  const sub = customAccount()
  assert.equal(canAccessAdminPage(sub, "/app/customer-groups/group_1"), true)
  assert.equal(canAccessAdminPage(sub, "/app/customers"), false)
  assert.equal(canAccessAdminApi(sub, "GET", "/admin/customer-groups"), true)
  assert.equal(canAccessAdminApi(sub, "GET", "/admin/customer-groups-other"), false)
  assert.equal(canAccessAdminApi(sub, "GET", "/admin/customers"), false)
})
test("view-only custom grants cannot mutate data; management grants can", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(canAccessAdminApi(customAccount(), method, "/admin/customer-groups"), false)
    assert.equal(canAccessAdminApi(customAccount({ ...custom, access_mode: "manage" }), method, "/admin/customer-groups"), true)
  }
  assert.equal(canAccessAdminApi(customAccount(), "HEAD", "/admin/customer-groups"), true)
})
test("disabled or unassigned custom grants cannot provide page or API access", () => {
  for (const access of [customAccount({ ...custom, enabled: false }), { ...customAccount(), permissions: [] }, { ...customAccount(), active: false }]) {
    assert.equal(canAccessAdminPage(access, "/app/customer-groups"), false)
    assert.equal(canAccessAdminApi(access, "GET", "/admin/customer-groups"), false)
  }
})
test("custom route definitions reject roots, traversal, wildcard, encoded and reserved paths", () => {
  for (const path of ["/", "/app", "/admin-access", "/settings", "/settings/users", "/inventory", "/reports/../admin-access", "/reports%2fadmin-access", "/reports/*", "https://other.example/reports"]) assert.equal(validCustomPermissionPath(path, "page"), false, path)
  for (const path of ["/admin", "/admin/access", "/admin/access/users", "/admin/users", "/admin/invites", "/admin/api-keys", "/admin/workflows-executions", "/auth/user", "/admin/*", "/admin/reports%2F..%2Fusers"]) assert.equal(validCustomPermissionPath(path, "api"), false, path)
  assert.equal(validCustomPermissionPath("/reports", "page"), true)
  assert.equal(validCustomPermissionPath("/settings/regions", "page"), true)
  assert.equal(validCustomPermissionPath("/admin/reports", "api"), true)
})
test("custom grants cannot authorize security administration even if a stored definition is tampered with", () => {
  const sub = customAccount({ ...custom, access_mode: "manage", page_paths: ["/admin-access", "/settings"], api_paths: ["/admin"] })
  for (const path of ["/admin/access/permissions", "/admin/access/users", "/admin/users", "/admin/invites", "/admin/api-keys", "/admin/workflows-executions"]) assert.equal(canAccessAdminApi(sub, "POST", path), false, path)
  assert.equal(canAccessAdminPage(sub, "/app/admin-access"), false)
  assert.equal(canAccessAdminPage(sub, "/app/settings/users"), false)
})
