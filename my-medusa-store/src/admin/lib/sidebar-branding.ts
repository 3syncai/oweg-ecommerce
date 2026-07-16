const STYLE_ID = "oweg-sidebar-branding"
const LOGO_CLASS = "oweg-sidebar-logo"
const AVATAR_CLASS = "oweg-sidebar-avatar"

let logoSrc: string | null = null
let initialized = false
let applyTimer: number | null = null

function isAuthRoute() {
  const path = window.location.pathname
  return path.endsWith("/login") || path.includes("/reset-password")
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return

  const styleEl = document.createElement("style")
  styleEl.id = STYLE_ID
  styleEl.textContent = `
    .${AVATAR_CLASS}.${LOGO_CLASS}-ready {
      position: relative;
      overflow: hidden;
      background: #fff !important;
    }

    .${AVATAR_CLASS}.${LOGO_CLASS}-ready > :not(img.${LOGO_CLASS}) {
      opacity: 0 !important;
    }

    img.${LOGO_CLASS} {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      pointer-events: none;
      z-index: 1;
      border-radius: inherit;
      background: #fff;
    }
  `
  document.head.appendChild(styleEl)
}

function brandAvatar(root: HTMLElement) {
  if (!logoSrc) return

  root.classList.add(AVATAR_CLASS, `${LOGO_CLASS}-ready`)

  let img = root.querySelector<HTMLImageElement>(`img.${LOGO_CLASS}`)
  if (!img) {
    img = document.createElement("img")
    img.className = LOGO_CLASS
    img.alt = "OWEG"
    img.setAttribute("aria-hidden", "true")
    img.draggable = false
    root.insertBefore(img, root.firstChild)
  }

  if (img.getAttribute("src") !== logoSrc) {
    img.src = logoSrc
  }
}

function findSidebarTriggers(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[class*="grid-cols-[24px_1fr_15px]"]'
    )
  )
}

function findAvatarRoot(trigger: HTMLElement): HTMLElement | null {
  const candidates = Array.from(
    trigger.querySelectorAll<HTMLElement>("span.h-6.w-6.overflow-hidden")
  )

  if (candidates.length > 0) {
    return candidates[0]
  }

  // Fallback: direct child avatar-like span
  for (const child of Array.from(trigger.children)) {
    if (
      child instanceof HTMLElement &&
      child.tagName === "SPAN" &&
      child.classList.contains("overflow-hidden") &&
      child.classList.contains("h-6")
    ) {
      return child
    }
  }

  const nested = trigger.querySelector<HTMLElement>(
    ".size-6 span.overflow-hidden, .flex.size-6 span.overflow-hidden"
  )
  return nested
}

function applySidebarBranding() {
  if (!logoSrc) return

  if (isAuthRoute()) {
    return
  }

  ensureStyles()

  for (const trigger of findSidebarTriggers()) {
    const avatar = findAvatarRoot(trigger)
    if (avatar) {
      brandAvatar(avatar)
    }
  }
}

function scheduleApply() {
  if (applyTimer !== null) {
    window.clearTimeout(applyTimer)
  }

  applyTimer = window.setTimeout(() => {
    applyTimer = null
    applySidebarBranding()
  }, 0)
}

function setupRouteWatcher() {
  const observer = new MutationObserver(scheduleApply)
  observer.observe(document.body, { childList: true, subtree: true })

  window.addEventListener("popstate", scheduleApply)

  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = (...args) => {
    originalPushState(...args)
    scheduleApply()
  }

  history.replaceState = (...args) => {
    originalReplaceState(...args)
    scheduleApply()
  }
}

export function initSidebarBranding(src: string) {
  logoSrc = src

  if (!initialized) {
    initialized = true
    setupRouteWatcher()
  }

  scheduleApply()
}
