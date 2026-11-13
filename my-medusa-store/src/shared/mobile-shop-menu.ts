export type MobileMenuItem = {
  label: string
  href: string
  section: "Shop" | "Support"
  visible: boolean
}

export const defaultMobileMenu: MobileMenuItem[] = [
  { label: "Brands", href: "/brands", section: "Shop", visible: true },
  { label: "Discounts", href: "/flash-sale", section: "Shop", visible: true },
  { label: "Specials", href: "/specials", section: "Shop", visible: true },
  { label: "Track an order", href: "/account/orders", section: "Support", visible: true },
  { label: "Help & support", href: "/account/help", section: "Support", visible: true },
]

export const mobileMenuLimit = 24
const fixedDestinations = new Set([...defaultMobileMenu.map(item => item.href), "/contact", "/faq", "/returns-policy", "/shipping-policy"])

export function parseMobileMenu(value: unknown): MobileMenuItem[] | null {
  if (!Array.isArray(value) || value.length > mobileMenuLimit) return null
  const result: MobileMenuItem[] = []
  const destinations = new Set<string>()
  for (const item of value) {
    if (!item || typeof item.label !== "string" || typeof item.href !== "string" ||
        (item.section !== "Shop" && item.section !== "Support") || typeof item.visible !== "boolean") return null
    const label = item.label.trim()
    const href = item.href.trim()
    const destination = href.toLowerCase().replace(/%26/g, "&")
    if (!label || label.length > 48 || href.length > 200 ||
        (!fixedDestinations.has(href) && !/^\/(?:brands\/[a-z0-9-]+|c\/(?:[a-z0-9-]|%26|&)+(?:\/(?:[a-z0-9-]|%26|&)+)?)$/i.test(href)) ||
        destinations.has(destination)) return null
    destinations.add(destination)
    result.push({ label, href, section: item.section, visible: item.visible })
  }
  return result
}
