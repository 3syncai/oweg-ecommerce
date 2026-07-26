/**
 * UI-only: hide Medusa admin sidebar store header + Search (⌘K).
 * Nav links, Settings, and bottom user menu stay visible.
 */

const STYLE_ID = "oweg-sidebar-chrome-hide"
const SEARCH_ATTR = "data-oweg-hide-search"

let initialized = false
let applyTimer: number | null = null

function isAuthRoute() {
  const path = window.location.pathname
  return path.endsWith("/login") || path.includes("/reset-password")
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    /* Top sticky store header (OWEG Store + …) — not the bottom user menu */
    aside .sticky.top-0 {
      display: none !important;
    }

    /* Search (⌘K) row marked by observer */
    aside [${SEARCH_ATTR}="true"] {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}

function markSearchBars() {
  const asides = document.querySelectorAll("aside")
  asides.forEach((aside) => {
    const buttons = aside.querySelectorAll("button")
    buttons.forEach((btn) => {
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim()
      // Medusa Searchbar shows label + ⌘K (or Ctrl+K on some locales)
      const isCmdK = text.includes("⌘K") || /Ctrl\+?K/i.test(text)
      if (!isCmdK) return

      const wrapper =
        (btn.closest("div.px-3") as HTMLElement | null) ||
        (btn.parentElement as HTMLElement | null)
      if (wrapper) {
        wrapper.setAttribute(SEARCH_ATTR, "true")
      } else {
        btn.setAttribute(SEARCH_ATTR, "true")
      }
    })
  })
}

function apply() {
  if (isAuthRoute()) return
  ensureStyles()
  markSearchBars()
}

function scheduleApply() {
  if (applyTimer !== null) window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => {
    applyTimer = null
    apply()
  }, 80)
}

export function initSidebarChromeHide() {
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
