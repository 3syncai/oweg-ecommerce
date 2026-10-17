/** Explicit grants shared by the server policy and role editor. No user-supplied API prefixes. */
export const ADMIN_RESPONSIBILITIES = [
  { id: "customers.people", group: "customers", label: "Customers", pages: ["/customers"], apis: ["customers"] },
  { id: "customers.groups", group: "customers", label: "Customer groups", pages: ["/customer-groups", "/oweg-customer-groups"], apis: ["customer-groups"] },
  { id: "catalog.products", group: "catalog", label: "Products & brands", pages: ["/products"], apis: ["products", "product-variants", "product-types", "product-tags", "inventory-items", "stock-locations", "reservation-items", "custom/vendor-products", "brand-authorizations"] },
  { id: "catalog.collections", group: "catalog", label: "Collections", pages: ["/collections"], apis: ["collections"] },
  { id: "catalog.categories", group: "catalog", label: "Categories", pages: ["/categories"], apis: ["product-categories"] },
  { id: "catalog.prices", group: "catalog", label: "Price lists", pages: ["/price-lists"], apis: ["price-lists", "price-preferences"] },
  { id: "orders.orders", group: "orders", label: "Orders", pages: ["/orders"], apis: ["orders", "fulfillments", "payments", "payment-collections"] },
  { id: "orders.drafts", group: "orders", label: "Draft orders", pages: ["/draft-orders"], apis: ["draft-orders"] },
  { id: "orders.booking", group: "orders", label: "Packet booking", pages: ["/packet-booking"], apis: ["packet-booking"] },
  { id: "returns.requests", group: "returns", label: "Return requests & approvals", pages: ["/return-requests"], apis: ["return-requests"] },
  { id: "returns.booking", group: "returns", label: "Return packet booking", pages: ["/return-packet-booking"], apis: ["return-packet-booking"] },
  { id: "returns.returns", group: "returns", label: "Returns", pages: ["/returns"], apis: ["returns", "return-reasons"] },
  { id: "returns.claims", group: "returns", label: "Claims", pages: ["/claims"], apis: ["claims"] },
  { id: "returns.exchanges", group: "returns", label: "Exchanges", pages: ["/exchanges"], apis: ["exchanges"] },
  { id: "vendors.directory", group: "vendors", label: "Vendors & requests", pages: ["/vendors", "/vendor-requests"], apis: ["vendors"] },
  { id: "vendors.brands", group: "vendors", label: "Brand authorizations", pages: ["/brand-authorizations"], apis: ["brand-authorizations"] },
  { id: "marketing.sales", group: "marketing", label: "Flash sales", pages: ["/flash-sale"], apis: ["flash-sale"] },
  { id: "marketing.homepage", group: "marketing", label: "Homepage content", pages: ["/oweg-homepage"], apis: ["featured-brands", "mega-menu-banners"] },
  { id: "marketing.promotions", group: "marketing", label: "Promotions", pages: ["/promotions"], apis: ["promotions"] },
  { id: "marketing.campaigns", group: "marketing", label: "Campaigns", pages: ["/campaigns"], apis: ["campaigns"] },
  { id: "accounting.payouts", group: "accounting", label: "Vendor payouts", pages: ["/vendor-payouts"], apis: ["vendor-payouts"] },
  { id: "accounting.commission", group: "accounting", label: "Vendor commission", pages: ["/vendor-commission"], apis: ["vendor-commission"] },
  { id: "accounting.claims", group: "accounting", label: "Vendor claims", pages: ["/vendor-claims"], apis: ["vendor-reports"] },
  { id: "accounting.tax", group: "accounting", label: "Marketplace tax", pages: ["/vendor-marketplace-tax"], apis: ["vendor-marketplace-tax"] },
  { id: "partners.admins", group: "partners", label: "Partner administrators", pages: ["/affiliate-admins"], apis: ["affiliate/admins"] },
  { id: "partners.users", group: "partners", label: "Partner applications", pages: ["/affiliate-users"], apis: ["affiliate/users"] },
] as const

export function hasAdminGroup(permissions: readonly string[], group: string) {
  return permissions.includes(group) || ADMIN_RESPONSIBILITIES.some(item => item.group === group && permissions.includes(item.id))
}
