import { test } from "node:test"
import assert from "node:assert/strict"
import { canAccessAdminPage, validatePermissions, type AdminAccess, type AdminPermission } from "../../../shared/admin-access"
import { canAccessAdminApi } from "../policy"
import { roleInput } from "../validation"
import { credentialMessage, adminSiteUrl } from "../credential-mail"

const account = (...permissions: AdminPermission[]): AdminAccess => ({ user_id: "sub", kind: "subadmin", active: true, role_id: "r", role_name: "Dispatch", responsibilities: "", permissions })

test("packet booking responsibility cannot manage orders, drafts, payments or admin security", () => {
  const access = account("orders.booking")
  assert.equal(canAccessAdminPage(access, "/app/packet-booking"), true)
  assert.equal(canAccessAdminApi(access, "POST", "/admin/packet-booking"), true)
  for (const page of ["/orders", "/draft-orders", "/admin-access"]) assert.equal(canAccessAdminPage(access, page), false)
  for (const path of ["/admin/orders/o1", "/admin/draft-orders", "/admin/payments/p1/capture", "/admin/access/roles", "/admin/access/users"]) {
    assert.equal(canAccessAdminApi(access, "POST", path), false, path)
  }
})

test("multiple responsibilities compose without granting the whole parent group", () => {
  const access = account("orders.drafts", "customers.groups")
  assert.equal(canAccessAdminApi(access, "POST", "/admin/draft-orders"), true)
  assert.equal(canAccessAdminApi(access, "POST", "/admin/customer-groups"), true)
  assert.equal(canAccessAdminApi(access, "POST", "/admin/customers"), false)
  assert.equal(canAccessAdminApi(access, "POST", "/admin/orders"), false)
  assert.equal(canAccessAdminPage(access, "/app/orders"), false)
  assert.equal(canAccessAdminApi(access, "GET", "/admin/products"), true)
  assert.equal(canAccessAdminApi(access, "POST", "/admin/products"), false)
})

test("individual order/vendor grants never inherit cross-section accounting actions", () => {
  const access = account("orders.orders", "vendors.directory")
  for (const method of ["GET", "POST"]) {
    assert.equal(canAccessAdminApi(access, method, "/admin/vendors/v1/commission"), false)
    assert.equal(canAccessAdminApi(access, method, "/admin/orders/o1/cancel-payout"), false)
  }
  assert.equal(canAccessAdminApi(account("accounting.commission"), "POST", "/admin/vendors/v1/commission"), true)
  assert.equal(canAccessAdminApi(account("accounting.payouts"), "POST", "/admin/orders/o1/cancel-payout"), true)
})

test("partner user approvers cannot create partner administrators", () => {
  const access = account("partners.users")
  assert.equal(canAccessAdminApi(access, "POST", "/admin/affiliate/users/u1/approve"), true)
  assert.equal(canAccessAdminApi(access, "POST", "/admin/affiliate/admins"), false)
})

test("temporary credentials cannot access business pages or APIs even with broad/custom grants", () => {
  const access = { ...account("orders", "custom_any"), must_change_password: true,
    custom_permissions: [{ id: "custom_any" as const, name: "Any", description: "", page_paths: ["/orders"], api_paths: ["/admin/orders"], enabled: true, access_mode: "manage" as const }] }
  assert.equal(canAccessAdminPage(access, "/app/change-password"), true)
  assert.equal(canAccessAdminPage(access, "/app/login"), true)
  for (const path of ["/app/orders", "/app/settings/profile", "/app/my-access"]) assert.equal(canAccessAdminPage(access, path), false)
  for (const method of ["GET", "POST"]) assert.equal(canAccessAdminApi(access, method, "/admin/orders"), false)
  assert.equal(canAccessAdminPage({ ...access, active: false }, "/app/change-password"), false)
})

test("role validation accepts registered responsibility IDs and rejects invented or privileged IDs", () => {
  assert.deepEqual(validatePermissions(["orders.booking", "orders.booking"]), ["orders.booking"])
  assert.equal(roleInput.safeParse({ name: "Dispatch", permissions: ["orders.booking"] }).success, true)
  for (const grant of ["orders.*", "orders.secret", "superadmin", "access.users"]) {
    assert.throws(() => validatePermissions([grant]))
    assert.equal(roleInput.safeParse({ name: "Bad", permissions: [grant] }).success, false)
  }
})

test("welcome message includes the greeting, admin site, temporary credential, role and creation date", () => {
  const original = process.env.ADMIN_SITE_URL
  try {
    process.env.ADMIN_SITE_URL = "https://admin.example.test/app"
    const mail = credentialMessage({ email: "user@example.test", password: "temporary-for-fixture", name: "Alex", role: "Dispatch", date: new Date("2026-10-17T12:00:00Z") })
    const content = mail.paragraphs.join("\n")
    assert.match(mail.intro, /Hello Alex/)
    for (const value of ["https://admin.example.test/app", "user@example.test", "temporary-for-fixture", "Dispatch", "2026", "must set"]) assert.ok(content.includes(value), value)
    process.env.ADMIN_SITE_URL = "javascript:alert(1)"
    assert.throws(adminSiteUrl)
    process.env.ADMIN_SITE_URL = "https://user:secret@admin.example.test/app"
    assert.throws(adminSiteUrl)
  } finally { if (original === undefined) delete process.env.ADMIN_SITE_URL; else process.env.ADMIN_SITE_URL = original }
})
