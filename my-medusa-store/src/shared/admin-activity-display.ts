type DisplayEvent = {
  action: string
  category: string
  method?: string | null
  path?: string | null
  target_id: string
  status_code?: number | null
}

const sections: Record<string, [string, string]> = {
  customers: ["Customers", "customer"],
  "customer-groups": ["Customer groups", "customer group"],
  "oweg-customer-groups": ["Customer groups", "customer group"],
  products: ["Products", "product"],
  "product-variants": ["Product variants", "product variant"],
  collections: ["Brands", "brand"],
  categories: ["Categories", "category"],
  "product-categories": ["Categories", "category"],
  "price-lists": ["Price lists", "price list"],
  orders: ["Orders", "order"],
  "draft-orders": ["Draft orders", "draft order"],
  "packet-booking": ["Packet booking", "packet booking"],
  "return-packet-booking": ["Return packet booking", "return pickup"],
  "return-requests": ["Return requests", "return request"],
  returns: ["Returns", "return"],
  claims: ["Claims", "claim"],
  exchanges: ["Exchanges", "exchange"],
  vendors: ["Vendors", "vendor"],
  "vendor-requests": ["Vendor requests", "vendor request"],
  "brand-authorizations": ["Brand authorizations", "brand authorization"],
  "flash-sale": ["Flash sales", "flash sale"],
  "oweg-homepage": ["Homepage content", "homepage content"],
  "featured-brands": ["Featured brands", "featured brand"],
  "mega-menu-banners": ["Menu banners", "menu banner"],
  promotions: ["Promotions", "promotion"],
  campaigns: ["Campaigns", "campaign"],
  "vendor-payouts": ["Vendor payouts", "vendor payout"],
  "vendor-commission": ["Vendor commissions", "vendor commission"],
  "vendor-claims": ["Vendor claims", "vendor claim"],
  "vendor-reports": ["Vendor claims", "vendor claim"],
  "vendor-marketplace-tax": ["Marketplace tax", "marketplace tax"],
  "affiliate-admins": ["Partner admins", "partner admin"],
  "activity-log": ["Activity Log", "activity log"],
  "admin-access": ["Admin Access", "admin access"],
  "my-access": ["My Access", "access overview"],
  uploads: ["Uploads", "file"],
  affiliate: ["Partners", "partner"],
  access: ["Admin Access", "admin access"],
  "inventory-items": ["Product stock", "stock item"],
  "stock-locations": ["Stock locations", "stock location"],
}
function section(path: string) {
  const parts = path
    .replace(/^\/(app|admin)\//, "")
    .split("/")
    .filter(Boolean)
  if (parts[0] === "custom" && parts[1] === "vendor-products")
    return {
      parts: parts.slice(1),
      names: ["Vendor products", "vendor product"],
    }
  return { parts, names: sections[parts[0]] || ["Admin area", "resource"] }
}
export function activityArea(event: DisplayEvent): string {
  if (event.category === "authentication") return "Admin account"
  if (event.category === "access_change") return "Accounts & permissions"
  const path = event.path || event.target_id
  if (path === "/app/oweg-homepage/brands") return "Featured brands"
  if (path === "/app/settings/profile") return "Profile settings"
  return section(path).names[0]
}
export function activityDescription(event: DisplayEvent): string {
  const fixed: Record<string, string> = {
    "auth.login": "Signed in",
    "auth.login_failed": "Failed sign-in",
    "auth.logout": "Signed out",
    "auth.session_created": "Started authentication session",
    "auth.request": "Authentication request",
    "role.created": "Created an admin role",
    "role.updated": "Updated an admin role",
    "permission.created": "Created a permission",
    "permission.updated": "Updated a permission",
    "account.updated": "Updated subadmin access",
    "account.assigned": "Assigned subadmin access",
    "credentials.reset": "Reset admin credentials",
    "superadmin.bootstrapped": "Configured superadmin from CLI",
  }
  if (fixed[event.action]) return fixed[event.action]
  if (event.category === "access_change") {
    const label = event.action.replace(/[._]/g, " ")
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (event.category === "navigation") {
    const { parts } = section(event.path || event.target_id)
    const area = activityArea(event)
    const detail =
      parts.length > 1 && !["oweg-homepage", "settings"].includes(parts[0])
    return `${event.action === "page.denied" ? "Blocked visit to" : "Viewed"} ${detail ? `${section(event.path || event.target_id).names[1]} details` : area}`
  }
  const { parts, names } = section(event.path || event.target_id)
  const noun = names[1]
  const last = parts[parts.length - 1]
  const commands: Record<string, [string, string]> = {
    approve: ["Approved", "approve"],
    reject: ["Rejected", "reject"],
    verify: ["Verified", "verify"],
    cancel: ["Cancelled", "cancel"],
    "admin-cancel": ["Updated cancellation for", "update cancellation for"],
    "mark-delivered": ["Marked delivered:", "mark delivered:"],
    "mark-cod-paid": ["Recorded COD payment for", "record COD payment for"],
  }
  let verb: string, attempted: string
  if (event.method === "GET" || event.method === "HEAD")
    return `Read ${names[0].toLowerCase()}`
  if (event.method === "DELETE") {
    verb = "Deleted"
    attempted = "delete"
  } else if (commands[last]) [verb, attempted] = commands[last]
  else if (["PUT", "PATCH"].includes(event.method || "")) {
    verb = "Updated"
    attempted = "update"
  }
  // Medusa uses POST for both creation and updates. Use conservative wording
  // for custom commands; never claim a financial action completed from a URL.
  else if (
    parts.length === 1 &&
    [
      "customers",
      "customer-groups",
      "products",
      "collections",
      "product-categories",
      "promotions",
      "campaigns",
    ].includes(parts[0])
  ) {
    verb = "Created"
    attempted = "create"
  } else if (
    parts.length === 2 &&
    /^(cus_|cusgroup_|prod_|pcol_|pcat_|promo_|procamp_|pl_|order_)/.test(last)
  ) {
    verb = "Updated"
    attempted = "update"
  } else {
    verb = "Submitted action for"
    attempted = "submit action for"
  }
  return `${event.status_code && event.status_code >= 400 ? `Attempted to ${attempted}` : verb} ${noun}`
}
