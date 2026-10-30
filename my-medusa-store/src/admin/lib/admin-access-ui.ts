import { ADMIN_RESPONSIBILITIES } from "../../shared/admin-responsibilities"
import { ADMIN_PERMISSION_GROUPS, canAccessAdminPage, matchesPath, normalizeAdminPath, type AdminAccess } from "../../shared/admin-access"
import { currentAdminAccess, resetAdminAccessRequest } from "./admin-access-client"

let initialized = false
let access: AdminAccess | null = null
let pending = false
let timer: number | undefined
let lastRefresh = 0
let lastAttempt = 0
let sessionGeneration = 0
let wasAuthPage = false
let lastRecordedPage = ""

function recordPage() {
  const page = window.location.pathname.replace(/\/+$/, "")
  if (page === lastRecordedPage || isAuthPage() || !/^\/app(?:\/[a-zA-Z0-9_-]+)*$/.test(page)) return
  lastRecordedPage = page
  void fetch("/admin/access/activity/page-view", { method: "POST", credentials: "include", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page_path: page }) }).catch(() => { lastRecordedPage = "" })
}

const isAuthPage = () => /\/(login|reset-password|invite)(\/|$)/.test(window.location.pathname)

function statusPanel(message: string, retry = false) {
  let panel = document.getElementById("oweg-admin-access-status")
  if (panel) return
  panel = document.createElement("section")
  panel.id = "oweg-admin-access-status"
  panel.setAttribute("role", "status")
  panel.style.cssText = "position:fixed;inset:20% 15% auto;z-index:10000;padding:28px;border:1px solid #d1d5db;border-radius:12px;background:var(--bg-base,#fff);color:var(--fg-base,#111);box-shadow:0 8px 30px #0002;font:14px system-ui"
  const text = document.createElement("p")
  text.textContent = message
  panel.appendChild(text)
  if (retry) {
    const button = document.createElement("button")
    button.textContent = "Try again"
    button.style.cssText = "margin-top:16px;padding:8px 14px;border:1px solid #aaa;border-radius:6px;cursor:pointer"
    button.onclick = () => { panel?.remove(); void refresh() }
    panel.appendChild(button)
    const login = document.createElement("a")
    login.href = "/app/login"
    login.textContent = "Sign in"
    login.style.cssText = "margin-left:16px;text-decoration:underline"
    panel.appendChild(login)
  }
  document.body.appendChild(panel)
}

function apply() {
  if (!window.location.pathname.startsWith("/app") || isAuthPage()) {
    delete document.documentElement.dataset.owegAccessPending
    document.getElementById("oweg-admin-access-status")?.remove()
    if (!wasAuthPage) { access = null; lastRefresh = 0; lastAttempt = 0; lastRecordedPage = ""; sessionGeneration++; resetAdminAccessRequest() }
    wasAuthPage = true
    return
  }
  wasAuthPage = false
  if (!access) {
    document.documentElement.dataset.owegAccessPending = "true"
    statusPanel("Checking your admin access…")
    if (!pending && Date.now() - lastAttempt > 5000) void refresh()
    return
  }
  if (access.must_change_password && normalizeAdminPath(window.location.pathname) !== "/change-password") {
    document.documentElement.dataset.owegAccessPending = "true"
    window.location.replace("/app/change-password")
    return
  }
  const navItems = new Set<HTMLElement>()
  document.querySelectorAll<HTMLAnchorElement>("aside a[href]").forEach(link => {
    const url = new URL(link.href, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/app")) return
    const allowed = canAccessAdminPage(access, url.pathname)
    if (allowed) link.removeAttribute("data-oweg-access-hidden")
    else link.setAttribute("data-oweg-access-hidden", "true")
    const item = link.closest<HTMLElement>("div.px-3")
    // The flex gap belongs to each NavItem wrapper, not to the link. Leaving
    // denied non-collapsible wrappers in the layout creates phantom gaps.
    if (item) navItems.add(item)
  })
  const grantedPaths = [
    ...ADMIN_RESPONSIBILITIES.filter(item => access!.permissions.includes(item.id)).flatMap(item => [...item.pages]),
    ...ADMIN_PERMISSION_GROUPS.filter(group => access!.permissions.includes(group.id)).flatMap(group => [...group.paths]),
    ...access.custom_permissions?.filter(permission => permission.enabled && access!.permissions.includes(permission.id)).flatMap(permission => permission.page_paths) || [],
  ]
  navItems.forEach(item => {
    const products = item.querySelector('a[href="/app/products"]')
    if (products) item.querySelector('button[aria-controls]')?.setAttribute("aria-label", "Toggle Products menu")
    // Medusa's compact menu has a separate collapsible trigger. Hide the whole
    // item when empty, but retain parents of explicitly granted custom pages.
    const hasChildren = !!item.querySelector("button[aria-controls]")
    const permittedProductChildren = !!products && ["/collections", "/categories"].some(path => canAccessAdminPage(access, path))
    const visible = permittedProductChildren || [...item.querySelectorAll<HTMLAnchorElement>('a[href^="/app/"]')].some(link => {
      const path = normalizeAdminPath(new URL(link.href).pathname)
      return canAccessAdminPage(access, path) || (hasChildren && grantedPaths.some(granted => matchesPath(granted, path)))
    })
    item.toggleAttribute("data-oweg-access-empty", !visible)
  })
  document.querySelectorAll<HTMLElement>("aside nav li").forEach(item => {
    const links = [...item.querySelectorAll<HTMLAnchorElement>('a[href^="/app/"]')]
    if (links.length) item.toggleAttribute("data-oweg-access-empty", !links.some(link => canAccessAdminPage(access, new URL(link.href).pathname)))
  })
  document.querySelectorAll<HTMLElement>("aside nav").forEach(nav => {
    const visible = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="/app/"]')].some(link => {
      const hidden = link.closest('[data-oweg-access-empty]')
      return (!hidden || hidden === nav) && !link.hasAttribute("data-oweg-access-hidden")
    })
    // A custom child may be unmounted inside a closed collapsible. Its
    // permitted parent trigger must remain available even before expansion.
    const expandable = [...nav.querySelectorAll<HTMLElement>("div.px-3")].some(item => !item.hasAttribute("data-oweg-access-empty") && !!item.querySelector("button[aria-controls]"))
    nav.toggleAttribute("data-oweg-access-empty", !visible && !expandable)
  })
  // Preserve useful context (for example a shipping profile name) without
  // offering navigation into another team's restricted section.
  document.querySelectorAll<HTMLAnchorElement>("main a[href]").forEach(link => {
    const url = new URL(link.href, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/app/")) return
    const denied = !canAccessAdminPage(access, url.pathname)
    if (denied) {
      link.setAttribute("data-oweg-context-only", "true")
      link.setAttribute("aria-disabled", "true")
      link.setAttribute("title", "Opening this section requires additional permission")
    } else if (link.hasAttribute("data-oweg-context-only")) {
      link.removeAttribute("data-oweg-context-only")
      link.removeAttribute("aria-disabled")
      link.removeAttribute("title")
    }
  })
  recordPage()
  if (!canAccessAdminPage(access, window.location.pathname)) {
    document.documentElement.dataset.owegAccessPending = "true"
    // Use the neutral landing page when core Medusa redirects to Orders.
    if (normalizeAdminPath(window.location.pathname) !== "/my-access") window.location.replace("/app/my-access")
    return
  }
  delete document.documentElement.dataset.owegAccessPending
  document.getElementById("oweg-admin-access-status")?.remove()
}

async function refresh() {
  if (pending || isAuthPage()) return
  pending = true
  lastAttempt = Date.now()
  const generation = sessionGeneration
  try {
    const value = await currentAdminAccess()
    if (generation !== sessionGeneration || isAuthPage()) return
    access = value
    lastRefresh = Date.now()
    apply()
  } catch {
    if (generation !== sessionGeneration || isAuthPage()) return
    access = null
    document.documentElement.dataset.owegAccessPending = "true"
    document.getElementById("oweg-admin-access-status")?.remove()
    statusPanel("Unable to verify your admin access. Sign in again or retry. If this continues, contact the superadmin.", true)
  } finally {
    pending = false
    // A previous session's request must not delay the newly signed-in account.
    if (generation !== sessionGeneration && !isAuthPage()) void refresh()
  }
}

export function initAdminAccessUi() {
  if (typeof window === "undefined" || initialized) return
  initialized = true
  const style = document.createElement("style")
  style.id = "oweg-admin-access-ui"
  style.textContent = `
    /* Keep Products as a link and its native Radix trigger as a separate chevron. */
    aside nav div.px-3:has(a[href="/app/products"]) { position: relative; }
    aside nav div.px-3:has(a[href="/app/products"]) > div:first-child a { display: flex; padding-right: 34px; }
    aside nav div.px-3:has(a[href="/app/products"]) button[aria-controls] {
      display: flex !important; position: absolute; top: 0; right: 12px;
      width: 28px; height: 28px; padding: 0; align-items: center; justify-content: center;
    }
    aside nav div.px-3:has(a[href="/app/products"]) button[aria-controls] > * { display: none; }
    aside nav div.px-3:has(a[href="/app/products"]) button[aria-controls]::after {
      content: ""; width: 7px; height: 7px; border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor; transform: rotate(45deg); margin-top: -4px;
      transition: transform 150ms ease;
    }
    aside nav div.px-3:has(a[href="/app/products"]) button[aria-expanded="true"]::after { transform: rotate(225deg); margin-top: 4px; }
    aside nav div.px-3:has(a[href="/app/products"]) ul > li:first-child { display: none; }
    /* Brand/category-only roles retain an expandable parent without gaining Products access. */
    aside nav div.px-3:has(a[href="/app/products"][data-oweg-access-hidden]) button[aria-controls] {
      position: relative; right: auto; width: 100%; padding: 2px 8px 2px 2px; justify-content: flex-start;
    }
    aside nav div.px-3:has(a[href="/app/products"][data-oweg-access-hidden]) button[aria-controls] > * { display: flex; }
    aside nav div.px-3:has(a[href="/app/products"][data-oweg-access-hidden]) button[aria-controls]::after { margin-left: auto; margin-right: 3px; }
    aside a[data-oweg-access-hidden="true"],
    aside [data-oweg-access-empty] { display: none !important; }
    a[data-oweg-context-only] { cursor: default !important; text-decoration: none !important; }
    /* Remove the leading divider when no core routes remain. */
    aside nav[data-oweg-access-empty] + div > div.px-3:first-child { display: none !important; }
    html[data-oweg-access-pending="true"] main,
    html[data-oweg-access-pending="true"] aside nav { visibility: hidden !important; }
  `
  document.head.appendChild(style)
  const blockRestrictedReference = (event: Event) => {
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
    if (!link || !access) return
    const url = new URL(link.href, window.location.origin)
    if (url.origin === window.location.origin && url.pathname.startsWith("/app/") && !canAccessAdminPage(access, url.pathname)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  document.addEventListener("click", blockRestrictedReference, true)
  document.addEventListener("auxclick", blockRestrictedReference, true)
  // Throttle instead of restarting a debounce for every spinner/table mutation.
  // A busy page must not postpone its initial access check indefinitely.
  const schedule = () => {
    if (timer !== undefined) return
    timer = window.setTimeout(() => { timer = undefined; apply() }, 40)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { subtree: true, childList: true })
  window.addEventListener("popstate", schedule)
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History["pushState"]>) => { original(...args); window.dispatchEvent(new Event("oweg-admin-location")); schedule() }
  }
  window.addEventListener("focus", () => { if (Date.now() - lastRefresh > 5000) void refresh() })
  window.setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastRefresh > 30000) void refresh() }, 10000)
  schedule()
}
