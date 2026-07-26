/**
 * UI-only: hide Medusa admin sidebar store header + Search (⌘K).
 * Settings sticky back header stays visible and is pointed at admin home.
 */

const STYLE_ID = "oweg-sidebar-chrome-hide"
const SEARCH_ATTR = "data-oweg-hide-search"
const HOME_ATTR = "data-oweg-settings-home"

let initialized = false
let applyTimer: number | null = null

function isAuthRoute() {
  const path = window.location.pathname
  return path.endsWith("/login") || path.includes("/reset-password")
}

function isSettingsRoute() {
  return window.location.pathname.includes("/settings")
}

/** Admin SPA home under /app basename → absolute /app or /app/ */
function adminHomeHref() {
  const path = window.location.pathname
  const appIdx = path.indexOf("/app")
  if (appIdx !== -1) {
    return `${path.slice(0, appIdx)}/app`
  }
  return "/app"
}

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  // Re-write styles so older bundles pick up the narrowed selector after hot reload
  style.textContent = `
    /* Main store header only (grid trigger) — keep Settings back header */
    aside .sticky.top-0:has([class*="grid-cols-[24px_1fr_15px]"]) {
      display: none !important;
    }

    /* Search (⌘K) row marked by observer */
    aside [${SEARCH_ATTR}="true"] {
      display: none !important;
    }

    /* Emphasize Settings → Home control */
    aside .sticky.top-0 a[${HOME_ATTR}="true"] {
      display: flex !important;
    }
  `
}

function markSearchBars() {
  const asides = document.querySelectorAll("aside")
  asides.forEach((aside) => {
    const buttons = aside.querySelectorAll("button")
    buttons.forEach((btn) => {
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim()
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

/**
 * Settings layout already has a sticky-top back link.
 * Point it at /app and label it Home so users are not stuck in /settings.
 */
function fixSettingsHomeLink() {
  if (!isSettingsRoute()) return

  const home = adminHomeHref()
  const stickyTops = document.querySelectorAll<HTMLElement>("aside .sticky.top-0")
  stickyTops.forEach((sticky) => {
    // Skip if this is the main store header (has the grid avatar trigger)
    if (sticky.querySelector('[class*="grid-cols-[24px_1fr_15px]"]')) return

    const link = sticky.querySelector("a") as HTMLAnchorElement | null
    if (!link) return

    if (link.getAttribute("href") !== home) {
      link.setAttribute("href", home)
    }
    link.setAttribute(HOME_ATTR, "true")

    // React Router Link ignores href — intercept click to leave settings
    if (link.dataset.owegHomeClick !== "1") {
      link.dataset.owegHomeClick = "1"
      link.addEventListener(
        "click",
        (e) => {
          e.preventDefault()
          e.stopPropagation()
          window.location.assign(home)
        },
        true
      )
    }

    // Prefer a clear Home label (keep arrow icon, replace leaf text)
    const textEl =
      link.querySelector("span, p") ||
      Array.from(link.querySelectorAll("*")).find((el) => {
        const t = (el.textContent || "").trim()
        return t.length > 0 && el.children.length === 0
      })

    if (textEl && (textEl.textContent || "").trim() !== "Home") {
      textEl.textContent = "Home"
    }
  })
}

function apply() {
  if (isAuthRoute()) return
  ensureStyles()
  markSearchBars()
  fixSettingsHomeLink()
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
