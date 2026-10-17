import { ADMIN_RESPONSIBILITIES } from "./admin-responsibilities"
/** Shared by the admin UI and API. Never trust the browser's copy of these grants. */
export const ADMIN_PERMISSION_GROUPS = [
  { id: "customers", label: "Customers", description: "Customers and customer groups", paths: ["/customers", "/customer-groups", "/oweg-customer-groups"] },
  { id: "catalog", label: "Product head", description: "Products, brands, categories and price lists", paths: ["/products", "/collections", "/categories", "/price-lists"] },
  { id: "orders", label: "Orders", description: "Orders, draft orders and packet booking", paths: ["/orders", "/draft-orders", "/packet-booking"] },
  { id: "returns", label: "Returns", description: "Return requests, approvals and return packet booking", paths: ["/return-requests", "/return-packet-booking", "/returns", "/claims", "/exchanges"] },
  { id: "vendors", label: "Vendors", description: "Vendors, vendor requests and brand authorizations", paths: ["/vendors", "/vendor-requests", "/brand-authorizations"] },
  { id: "marketing", label: "Marketing", description: "Flash sales, homepage content, promotions and campaigns", paths: ["/flash-sale", "/oweg-homepage", "/promotions", "/campaigns"] },
  { id: "accounting", label: "Accounting", description: "Vendor payouts, commissions, claims and marketplace tax", paths: ["/vendor-payouts", "/vendor-commission", "/vendor-claims", "/vendor-marketplace-tax"] },
  { id: "partners", label: "Partner admins", description: "Manage the existing partner administrators and partner applications", paths: ["/affiliate-admins", "/affiliate-users"] },
] as const

export type AdminPermission = typeof ADMIN_PERMISSION_GROUPS[number]["id"] | typeof ADMIN_RESPONSIBILITIES[number]["id"] | `custom_${string}`
export type CustomAdminPermission = {
  id: `custom_${string}`
  name: string
  description: string
  page_paths: string[]
  api_paths: string[]
  access_mode: "view" | "manage"
  enabled: boolean
}

const RESERVED_ADMIN_PAGES = ["/payment-health", "/activity-log", "/admin-access", "/my-access", "/change-password", "/inventory", "/login", "/reset-password", "/invite", "/settings/users", "/settings/api-key-management", "/settings/developer", "/settings/profile"]
const RESERVED_ADMIN_APIS = ["/admin/payment-health", "/admin/access", "/admin/users", "/admin/invites", "/admin/api-keys", "/admin/workflows", "/admin/workflows-executions", "/admin/links", "/admin/graph", "/admin/query", "/admin/modules"]

export function isReservedAdminApi(path: string): boolean {
  return RESERVED_ADMIN_APIS.some(prefix => matchesPath(path.toLowerCase(), prefix))
}

export function validCustomPermissionPath(path: string, kind: "page" | "api"): boolean {
  // Literal section prefixes only: no wildcards, traversal, encoded separators or root grants.
  if (!/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(path) || path.length > 200) return false
  if (kind === "page" && (matchesPath(path, "/app") || matchesPath(path, "/admin"))) return false
  if (kind === "api" && (!path.startsWith("/admin/") || path === "/admin")) return false
  const reserved = kind === "api" ? RESERVED_ADMIN_APIS : RESERVED_ADMIN_PAGES
  return !reserved.some(prefix => matchesPath(path, prefix) || matchesPath(prefix, path))
}
export type AdminAccess = {
  user_id: string
  kind: "superadmin" | "subadmin" | "unassigned"
  active: boolean
  role_id: string | null
  role_name: string | null
  responsibilities: string
  permissions: AdminPermission[]
  must_change_password?: boolean
  custom_permissions?: CustomAdminPermission[]
}

export function matchesPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function normalizeAdminPath(input: string): string {
  const path = input.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/"
  return path.startsWith("/app/") ? path.slice(4) : path === "/app" ? "/" : path
}

export function canAccessAdminPage(access: AdminAccess | null, input: string): boolean {
  const path = normalizeAdminPath(input)
  if (!access) return false
  if (path === "/login") return true
  if (access.must_change_password) return access.active && path === "/change-password"
  if (path === "/change-password") return access.active && access.kind === "subadmin"
  if (path === "/my-access") return true
  if (!access.active || access.kind === "unassigned") return false
  if (access.kind === "superadmin") return true
  if (path === "/settings/profile") return true
  if (RESERVED_ADMIN_PAGES.some(prefix => matchesPath(path, prefix))) return false
  // These native dialogs live under Orders but mutate Returns-owned APIs.
  const returnDialog = path.match(/^\/orders\/[^/]+\/(returns|claims|exchanges)(\/|$)/)
  if (returnDialog && !access.permissions.includes("returns") && !access.permissions.includes(`returns.${returnDialog[1]}` as AdminPermission)) return false
  if (access.custom_permissions?.some(permission => permission.enabled && access.permissions.includes(permission.id) &&
      permission.page_paths.some(prefix => matchesPath(path, prefix)))) return true
  if (ADMIN_RESPONSIBILITIES.some(item => access.permissions.includes(item.id) && item.pages.some(prefix => matchesPath(path, prefix)))) return true
  return ADMIN_PERMISSION_GROUPS.some(group =>
    access.permissions.includes(group.id) && group.paths.some(prefix => matchesPath(path, prefix))
  )
}

export function validatePermissions(value: unknown, customIds: string[] = []): AdminPermission[] {
  if (!Array.isArray(value) || value.length > 100 ||
      value.some(item => typeof item !== "string" || (!ADMIN_PERMISSION_GROUPS.some(g => g.id === item) && !ADMIN_RESPONSIBILITIES.some(g => g.id === item) && !customIds.includes(item)))) {
    throw new Error("Select registered permissions")
  }
  return [...new Set(value)] as AdminPermission[]
}
