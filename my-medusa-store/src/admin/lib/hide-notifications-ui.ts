/**
 * UI-only: hide Medusa admin topbar notification (bell) control.
 * Does not disable notification APIs — only hides the trigger in the shell.
 */

const STYLE_ID = "oweg-hide-notifications"
const INIT_KEY = "__owegHideNotificationsInit"

let applyTimer: number | null = null
let lastApplyAt = 0

function isAuthRoute() {
  const path = window.location.pathname
  return path.endsWith("/login") || path.includes("/reset-password")
}

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  // Topbar right cluster currently only hosts <Notifications />.
  style.textContent = `
    div.grid.w-full.grid-cols-2.border-b.p-3 > div.flex.items-center.justify-end {
      display: none !important;
    }
  `
}

function apply() {
  if (isAuthRoute()) return
  ensureStyles()
  lastApplyAt = Date.now()
}

function scheduleApply() {
  const now = Date.now()

  // Force a run if debounce keeps getting reset by constant DOM mutations
  if (now - lastApplyAt > 500) {
    apply()
  }

  if (applyTimer !== null) window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => {
    applyTimer = null
    apply()
  }, 80)
}

export function initHideNotificationsUi() {
  if (typeof window === "undefined") return

  const w = window as Window & { [INIT_KEY]?: boolean }
  ensureStyles()
  apply()

  if (w[INIT_KEY]) return
  w[INIT_KEY] = true

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
