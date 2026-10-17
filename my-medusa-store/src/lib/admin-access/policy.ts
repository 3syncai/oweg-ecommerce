import { ADMIN_RESPONSIBILITIES, hasAdminGroup } from "../../shared/admin-responsibilities"
import { matchesPath, isReservedAdminApi, type AdminAccess, type AdminPermission } from "../../shared/admin-access"

const API_GROUPS: Array<[AdminPermission, string[]]> = [
  ["customers", ["customers", "customer-groups"]],
  ["catalog", ["products", "product-variants", "product-categories", "collections", "product-types", "product-tags", "price-lists", "price-preferences", "inventory-items", "stock-locations", "reservation-items"]],
  ["orders", ["orders", "draft-orders", "packet-booking", "fulfillments", "payment-collections", "payments"]],
  ["returns", ["return-requests", "return-packet-booking", "returns", "return-reasons", "claims", "exchanges"]],
  ["vendors", ["vendors", "brand-authorizations"]],
  ["marketing", ["flash-sale", "featured-brands", "mega-menu-banners", "promotions", "campaigns"]],
  ["accounting", ["vendor-payouts", "vendor-commission", "vendor-reports", "vendor-marketplace-tax"]],
  ["partners", ["affiliate"]],
]

export function adminApiPath(url: string): string {
  // Decode once so encoded separators cannot bypass a narrower rule.
  const raw = url.split("?", 1)[0]
  try { return decodeURIComponent(raw).replace(/\/+$/, "") || "/" } catch { return "/invalid" }
}

export function requiredAdminPermission(path: string): AdminPermission | null {
  if (matchesPath(path, "/admin/custom/vendor-products")) return "catalog"
  // These endpoints live inside another section but belong to accounting.
  if (/^\/admin\/vendors\/[^/]+\/commission$/.test(path) ||
      /^\/admin\/orders\/[^/]+\/cancel-payout$/.test(path)) return "accounting"
  for (const [permission, roots] of API_GROUPS) {
    if (roots.some(root => matchesPath(path, `/admin/${root}`))) return permission
  }
  return null
}

const SHARED_READS = ["stores", "feature-flags", "regions", "currencies", "countries", "sales-channels", "shipping-options", "shipping-profiles", "fulfillment-providers", "tax-regions", "tax-rates"]

export function canAccessAdminApi(access: AdminAccess, method: string, path: string): boolean {
  if (!access.active || access.kind === "unassigned") return false
  if (access.must_change_password) return false
  if (access.kind === "superadmin") return true
  // Unknown/admin infrastructure endpoints are denied unless explicitly allowed.
  if (path === "/admin/users/me" && ["GET", "HEAD"].includes(method)) return true
  if (isReservedAdminApi(path)) return false
  const read = method === "GET" || method === "HEAD"
  if (access.custom_permissions?.some(permission => permission.enabled && access.permissions.includes(permission.id) &&
      (read || permission.access_mode === "manage") && permission.api_paths.some(prefix => matchesPath(path, prefix)))) return true
  if (read && access.permissions.length && SHARED_READS.some(root => matchesPath(path, `/admin/${root}`))) return true
  const permission = requiredAdminPermission(path)
  if (permission && access.permissions.includes(permission)) return true
  // Special accounting actions may never inherit an Orders/Vendors grant.
  const specialAccounting = /^\/admin\/vendors\/[^/]+\/commission$/.test(path) || /^\/admin\/orders\/[^/]+\/cancel-payout$/.test(path)
  if (specialAccounting) return access.permissions.includes(path.includes("cancel-payout") ? "accounting.payouts" : "accounting.commission")
  if (ADMIN_RESPONSIBILITIES.some(item => access.permissions.includes(item.id) &&
      item.apis.some(root => matchesPath(path, `/admin/${root}`)))) return true
  // Read-only dependencies used by editors, selectors and existing widgets.
  if (read && requiredAdminPermission(path) !== "accounting") {
    // Native order details aggregate existing returns/claims/exchanges and
    // detect installed plugin UI. This does not grant their write actions.
    if (hasAdminGroup(access.permissions, "orders") && ["plugins", "refund-reasons", "returns", "claims", "exchanges"].some(root => matchesPath(path, `/admin/${root}`))) return true
    if (hasAdminGroup(access.permissions, "orders") && ["products", "customers", "customer-groups", "inventory-items", "stock-locations", "reservation-items", "promotions"].some(root => matchesPath(path, `/admin/${root}`))) return true
    if (hasAdminGroup(access.permissions, "returns") && ["orders", "products", "fulfillments"].some(root => matchesPath(path, `/admin/${root}`))) return true
    if (hasAdminGroup(access.permissions, "accounting") && ["vendors", "orders"].some(root => matchesPath(path, `/admin/${root}`))) return true
    if (hasAdminGroup(access.permissions, "vendors") && matchesPath(path, "/admin/products")) return true
    if (hasAdminGroup(access.permissions, "marketing") && ["products", "collections", "product-categories", "product-types", "product-tags", "customer-groups"].some(root => matchesPath(path, `/admin/${root}`))) return true
    if (hasAdminGroup(access.permissions, "catalog") && ["products", "product-variants", "product-types", "product-tags", "product-categories", "collections", "customer-groups"].some(root => matchesPath(path, `/admin/${root}`))) return true
  }
  if (access.permissions.includes("catalog") && matchesPath(path, "/admin/brand-authorizations")) return true
  // Uploads are needed for product images, authorizations and homepage banners.
  if (matchesPath(path, "/admin/uploads") && ["catalog", "marketing", "vendors"].some(group => hasAdminGroup(access.permissions, group))) return true
  return false
}

/** Existing server integrations retain commerce APIs, never access management. */
export function canServiceKeyAccess(method: string, path: string): boolean {
  return requiredAdminPermission(path) !== null ||
    ((method === "GET" || method === "HEAD") && SHARED_READS.some(root => matchesPath(path, `/admin/${root}`)))
}
