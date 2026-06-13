const STYLE_ID = "oweg-auth-redesign"
const BRAND_PANEL_ID = "oweg-auth-brand-panel"
const CARD_WRAPPER_ID = "oweg-auth-card-wrapper"
const LOGO_ID = "oweg-auth-logo"
const THEME_KEY = "medusa_admin_theme"

type ResolvedTheme = "light" | "dark"

let logoSrc: string | null = null
let initialized = false
let applyTimer: number | null = null

function resolveTheme(): ResolvedTheme {
  const persisted = localStorage.getItem(THEME_KEY) ?? "system"

  if (persisted === "dark") {
    return "dark"
  }

  if (persisted === "light") {
    return "light"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function syncHtmlTheme() {
  const theme = resolveTheme()
  const html = document.documentElement

  html.classList.remove("light", "dark")
  html.classList.add(theme)
  html.style.colorScheme = theme
}

function isAuthRoute() {
  const path = window.location.pathname
  return path.endsWith("/login") || path.includes("/reset-password")
}

function getAuthStyles() {
  return `
  .oweg-auth-page {
    position: relative;
    overflow: hidden;
  }

  .oweg-auth-page::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-size: 48px 48px;
  }

  html.light .oweg-auth-page {
    background:
      radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.08), transparent 45%),
      radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.06), transparent 40%),
      #f4f4f5 !important;
  }

  html.light .oweg-auth-page::before {
    opacity: 0.35;
    background-image:
      linear-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.04) 1px, transparent 1px);
  }

  html.dark .oweg-auth-page {
    background:
      radial-gradient(circle at 20% 20%, rgba(34, 197, 94, 0.12), transparent 45%),
      radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.08), transparent 40%),
      #09090b !important;
  }

  html.dark .oweg-auth-page::before {
    opacity: 0.04;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px);
  }

  #${BRAND_PANEL_ID} {
    display: none;
  }

  #${CARD_WRAPPER_ID} {
    position: relative;
    z-index: 1;
    display: flex;
    width: 100%;
    min-height: 100dvh;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .oweg-auth-page .oweg-auth-card,
  #${CARD_WRAPPER_ID} > .max-w-\\[280px\\],
  #${CARD_WRAPPER_ID} > .max-w-\\[300px\\] {
    width: 100%;
    max-width: 26rem !important;
    margin: 0 !important;
    padding: 2rem;
    border-radius: 1.25rem;
    backdrop-filter: blur(16px);
  }

  html.light .oweg-auth-page .oweg-auth-card,
  html.light #${CARD_WRAPPER_ID} > .max-w-\\[280px\\],
  html.light #${CARD_WRAPPER_ID} > .max-w-\\[300px\\] {
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.8) inset,
      0 24px 48px rgba(15, 23, 42, 0.08);
  }

  html.dark .oweg-auth-page .oweg-auth-card,
  html.dark #${CARD_WRAPPER_ID} > .max-w-\\[280px\\],
  html.dark #${CARD_WRAPPER_ID} > .max-w-\\[300px\\] {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(24, 24, 27, 0.92);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 24px 48px rgba(0, 0, 0, 0.45);
  }

  .oweg-auth-page .oweg-default-logo {
    display: none !important;
  }

  #${LOGO_ID} {
    width: 4.5rem;
    height: 4.5rem;
    margin-bottom: 1.25rem;
    object-fit: contain;
  }

  html.light #${LOGO_ID} {
    filter: drop-shadow(0 10px 20px rgba(34, 197, 94, 0.18));
  }

  html.dark #${LOGO_ID} {
    filter: drop-shadow(0 12px 24px rgba(34, 197, 94, 0.25));
  }

  .oweg-auth-page h1 {
    font-size: 1.5rem !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em;
  }

  html.light .oweg-auth-page h1 {
    color: #18181b !important;
  }

  html.dark .oweg-auth-page h1 {
    color: #fafafa !important;
  }

  html.light .oweg-auth-page .text-ui-fg-subtle {
    color: #52525b !important;
    line-height: 1.5;
  }

  html.dark .oweg-auth-page .text-ui-fg-subtle {
    color: rgba(161, 161, 170, 0.95) !important;
    line-height: 1.5;
  }

  .oweg-auth-page input {
    height: 2.75rem !important;
    border-radius: 0.75rem !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  html.light .oweg-auth-page input {
    border: 1px solid #e4e4e7 !important;
    background: #ffffff !important;
    color: #18181b !important;
  }

  html.dark .oweg-auth-page input {
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    background: rgba(9, 9, 11, 0.85) !important;
    color: #fafafa !important;
  }

  html.light .oweg-auth-page input::placeholder {
    color: #a1a1aa !important;
  }

  html.dark .oweg-auth-page input::placeholder {
    color: rgba(161, 161, 170, 0.8) !important;
  }

  .oweg-auth-page input:focus {
    border-color: rgba(34, 197, 94, 0.65) !important;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18) !important;
    outline: none !important;
  }

  .oweg-auth-page button[type="submit"],
  .oweg-auth-page button.w-full {
    height: 2.75rem !important;
    border-radius: 0.75rem !important;
    border: none !important;
    background: linear-gradient(135deg, #22c55e 0%, #059669 100%) !important;
    color: #fff !important;
    font-weight: 600 !important;
    box-shadow: 0 10px 24px rgba(34, 197, 94, 0.28);
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  }

  .oweg-auth-page button[type="submit"]:hover:not(:disabled),
  .oweg-auth-page button.w-full:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 28px rgba(34, 197, 94, 0.34);
  }

  html.light .oweg-auth-page .text-ui-fg-muted,
  html.light .oweg-auth-page .txt-small {
    color: #71717a !important;
  }

  html.dark .oweg-auth-page .text-ui-fg-muted,
  html.dark .oweg-auth-page .txt-small {
    color: rgba(161, 161, 170, 0.9) !important;
  }

  html.light .oweg-auth-page a {
    color: #16a34a !important;
  }

  html.light .oweg-auth-page a:hover {
    color: #15803d !important;
  }

  html.dark .oweg-auth-page a {
    color: #4ade80 !important;
  }

  html.dark .oweg-auth-page a:hover {
    color: #86efac !important;
  }

  .oweg-brand-panel {
    position: relative;
    display: flex;
    flex: 1 1 50%;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    padding: 3rem;
    background: linear-gradient(145deg, #15803d 0%, #047857 45%, #064e3b 100%);
  }

  .oweg-brand-panel::before,
  .oweg-brand-panel::after {
    content: "";
    position: absolute;
    border-radius: 9999px;
    pointer-events: none;
    filter: blur(60px);
    opacity: 0.35;
  }

  .oweg-brand-panel::before {
    top: -6rem;
    left: -6rem;
    width: 18rem;
    height: 18rem;
    background: #86efac;
  }

  .oweg-brand-panel::after {
    right: -4rem;
    bottom: -4rem;
    width: 20rem;
    height: 20rem;
    background: #34d399;
  }

  .oweg-brand-panel__content,
  .oweg-brand-panel__footer {
    position: relative;
    z-index: 1;
  }

  .oweg-brand-panel__badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .oweg-brand-panel__badge-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 9999px;
    background: #bbf7d0;
  }

  .oweg-brand-panel__title {
    margin: 0;
    color: #fff;
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .oweg-brand-panel__title span {
    background: linear-gradient(90deg, #fff 0%, #d9f99d 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .oweg-brand-panel__copy {
    margin: 1.25rem 0 0;
    max-width: 28rem;
    color: rgba(236, 253, 245, 0.88);
    font-size: 1.05rem;
    line-height: 1.65;
  }

  .oweg-brand-panel__logo-wrap {
    position: absolute;
    top: 50%;
    right: -4rem;
    width: min(28rem, 55vw);
    height: min(28rem, 55vw);
    transform: translateY(-50%);
    pointer-events: none;
    opacity: 0.9;
  }

  .oweg-brand-panel__logo-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 30px 60px rgba(0, 0, 0, 0.35));
  }

  .oweg-brand-panel__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .oweg-brand-panel__header-icon {
    display: flex;
    width: 3rem;
    height: 3rem;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(8px);
  }

  .oweg-brand-panel__header-icon img {
    width: 2rem;
    height: 2rem;
    object-fit: contain;
  }

  .oweg-brand-panel__header-title {
    margin: 0;
    color: #fff;
    font-size: 1.35rem;
    font-weight: 700;
    line-height: 1;
  }

  .oweg-brand-panel__header-subtitle {
    margin: 0.25rem 0 0;
    color: rgba(209, 250, 229, 0.75);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .oweg-brand-panel__pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .oweg-brand-panel__pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.8rem;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.8rem;
  }

  @media (min-width: 1024px) {
    .oweg-auth-page {
      display: flex !important;
      align-items: stretch !important;
      justify-content: stretch !important;
    }

    #${BRAND_PANEL_ID} {
      display: flex;
    }

    #${CARD_WRAPPER_ID} {
      flex: 1 1 50%;
      min-height: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .oweg-auth-page button[type="submit"]:hover:not(:disabled),
    .oweg-auth-page button.w-full:hover:not(:disabled) {
      transform: none;
    }
  }
`
}

function createBrandPanel(src: string) {
  const panel = document.createElement("aside")
  panel.id = BRAND_PANEL_ID
  panel.className = "oweg-brand-panel"
  panel.setAttribute("aria-hidden", "true")

  panel.innerHTML = `
    <div class="oweg-brand-panel__content">
      <div class="oweg-brand-panel__header">
        <div class="oweg-brand-panel__header-icon">
          <img src="${src}" alt="" />
        </div>
        <div>
          <p class="oweg-brand-panel__header-title">OWEG</p>
          <p class="oweg-brand-panel__header-subtitle">Admin Dashboard</p>
        </div>
      </div>

      <div style="margin-top: 5rem; max-width: 32rem;">
        <span class="oweg-brand-panel__badge">
          <span class="oweg-brand-panel__badge-dot"></span>
          Commerce operations hub
        </span>
        <h2 class="oweg-brand-panel__title">
          Manage your<br />
          <span>marketplace</span>
        </h2>
        <p class="oweg-brand-panel__copy">
          Orders, products, vendors, payouts, and customer support — all in one secure admin workspace.
        </p>
      </div>
    </div>

    <div class="oweg-brand-panel__logo-wrap">
      <img src="${src}" alt="" />
    </div>

    <div class="oweg-brand-panel__footer">
      <div class="oweg-brand-panel__pills">
        <span class="oweg-brand-panel__pill">Secure access</span>
        <span class="oweg-brand-panel__pill">Real-time ops</span>
        <span class="oweg-brand-panel__pill">Vendor control</span>
      </div>
    </div>
  `

  return panel
}

function findAuthPageRoot() {
  return document.querySelector<HTMLElement>(
    ".bg-ui-bg-subtle.flex.min-h-dvh.w-dvw.items-center.justify-center"
  ) || document.querySelector<HTMLElement>(
    ".bg-ui-bg-base.flex.min-h-dvh.w-dvw.items-center.justify-center"
  )
}

function findAuthCard(pageRoot: HTMLElement) {
  return pageRoot.querySelector<HTMLElement>(
    ".max-w-\\[280px\\].flex-col.items-center"
  ) || pageRoot.querySelector<HTMLElement>(
    ".max-w-\\[300px\\].flex-col.items-center"
  )
}

function hideDefaultLogo(card: HTMLElement) {
  card
    .querySelector<HTMLElement>(".mb-4.h-\\[50px\\].w-\\[50px\\]")
    ?.classList.add("oweg-default-logo")
  card
    .querySelector<HTMLElement>(".size-14.bg-ui-button-neutral")
    ?.classList.add("oweg-default-logo")
}

function teardownAuthPage() {
  const pageRoot = document.querySelector<HTMLElement>(".oweg-auth-page")
  const card = document.getElementById(LOGO_ID)?.parentElement

  pageRoot?.classList.remove("oweg-auth-page")
  document.getElementById(BRAND_PANEL_ID)?.remove()
  document.getElementById(LOGO_ID)?.remove()

  const wrapper = document.getElementById(CARD_WRAPPER_ID)
  if (wrapper && card && card.parentElement === wrapper) {
    pageRoot?.insertBefore(card, wrapper)
    wrapper.remove()
  }
}

function applyAuthPageBranding() {
  if (!logoSrc) {
    return
  }

  if (!isAuthRoute()) {
    if (document.querySelector(".oweg-auth-page")) {
      teardownAuthPage()
    }
    return
  }

  const pageRoot = findAuthPageRoot()
  const card = pageRoot ? findAuthCard(pageRoot) : null

  if (!pageRoot || !card) {
    return
  }

  syncHtmlTheme()
  pageRoot.classList.add("oweg-auth-page")

  let wrapper = document.getElementById(CARD_WRAPPER_ID)
  if (!wrapper) {
    wrapper = document.createElement("div")
    wrapper.id = CARD_WRAPPER_ID
    pageRoot.insertBefore(wrapper, card)
    wrapper.appendChild(card)
  }

  if (!document.getElementById(BRAND_PANEL_ID)) {
    pageRoot.insertBefore(createBrandPanel(logoSrc), wrapper)
  }

  hideDefaultLogo(card)

  let logo = document.getElementById(LOGO_ID) as HTMLImageElement | null
  if (!logo) {
    logo = document.createElement("img")
    logo.id = LOGO_ID
    logo.alt = "OWEG"
    card.insertBefore(logo, card.firstChild)
  }

  logo.src = logoSrc

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = STYLE_ID
    document.head.appendChild(styleEl)
  }

  styleEl.textContent = getAuthStyles()
}

function scheduleApply() {
  if (applyTimer !== null) {
    window.clearTimeout(applyTimer)
  }

  applyTimer = window.setTimeout(() => {
    applyTimer = null
    applyAuthPageBranding()
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

function setupThemeSync() {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      syncHtmlTheme()
    }
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  const onSystemThemeChange = () => {
    if ((localStorage.getItem(THEME_KEY) ?? "system") === "system") {
      syncHtmlTheme()
    }
  }

  window.addEventListener("storage", onStorage)
  mediaQuery.addEventListener("change", onSystemThemeChange)
}

export function initAuthPageBranding(src: string) {
  logoSrc = src

  if (!initialized) {
    initialized = true
    setupRouteWatcher()
    setupThemeSync()
  }

  scheduleApply()
}
