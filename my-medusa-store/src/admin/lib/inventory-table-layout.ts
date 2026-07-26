/**
 * Medusa admin Inventory list layout helper.
 * Forces table-layout:fixed + column quotas so Title/SKU/Reserved/In stock
 * stay visible (long titles truncate instead of pushing columns off-screen).
 */

const STYLE_ID = "oweg-inventory-table-layout"

let initialized = false
let applyTimer: number | null = null

function isInventoryListPath(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/"
  // /app/inventory or /inventory — not detail /inventory/inv_...
  return /\/inventory$/.test(path)
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    /* Only active while body has the route marker class */
    body.oweg-inventory-list table {
      table-layout: fixed !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    body.oweg-inventory-list [class*="overflow-auto"],
    body.oweg-inventory-list [class*="overflow-x"] {
      overflow-x: auto !important;
    }

    /* select | title | sku | reserved | in stock | actions */
    body.oweg-inventory-list table thead th:nth-child(1),
    body.oweg-inventory-list table tbody td:nth-child(1) {
      width: 48px !important;
      max-width: 48px !important;
    }

    body.oweg-inventory-list table thead th:nth-child(2),
    body.oweg-inventory-list table tbody td:nth-child(2) {
      width: 42% !important;
      max-width: 42% !important;
      overflow: hidden !important;
    }

    body.oweg-inventory-list table thead th:nth-child(3),
    body.oweg-inventory-list table tbody td:nth-child(3) {
      width: 22% !important;
      max-width: 22% !important;
      overflow: hidden !important;
    }

    body.oweg-inventory-list table thead th:nth-child(4),
    body.oweg-inventory-list table tbody td:nth-child(4) {
      width: 12% !important;
      max-width: 12% !important;
      overflow: hidden !important;
      white-space: nowrap !important;
    }

    body.oweg-inventory-list table thead th:nth-child(5),
    body.oweg-inventory-list table tbody td:nth-child(5) {
      width: 12% !important;
      max-width: 12% !important;
      overflow: hidden !important;
      white-space: nowrap !important;
    }

    body.oweg-inventory-list table thead th:nth-child(6),
    body.oweg-inventory-list table tbody td:nth-child(6) {
      width: 48px !important;
      max-width: 48px !important;
    }

    body.oweg-inventory-list table tbody td:nth-child(2) > div,
    body.oweg-inventory-list table tbody td:nth-child(3) > div {
      max-width: 100% !important;
      min-width: 0 !important;
      overflow: hidden !important;
    }

    body.oweg-inventory-list table tbody td:nth-child(2) span,
    body.oweg-inventory-list table tbody td:nth-child(3) span {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
  `
  document.head.appendChild(style)
}

function applyRouteClass() {
  ensureStyles()
  const onList = isInventoryListPath(window.location.pathname)
  document.body.classList.toggle("oweg-inventory-list", onList)
}

function scheduleApply() {
  if (applyTimer !== null) window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => {
    applyTimer = null
    applyRouteClass()
  }, 80)
}

export function initInventoryTableLayout() {
  if (typeof window === "undefined" || initialized) return
  initialized = true

  ensureStyles()
  scheduleApply()

  const observer = new MutationObserver(() => scheduleApply())
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener("popstate", scheduleApply)
  const pushState = history.pushState.bind(history)
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    pushState(...args)
    scheduleApply()
  }
  const replaceState = history.replaceState.bind(history)
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    replaceState(...args)
    scheduleApply()
  }
}
