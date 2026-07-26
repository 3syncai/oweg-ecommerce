/**
 * Medusa admin DOM helper (2.11.x has no draft_order.* widget zones).
 * Injects payment-status badges on Draft Orders list + a detail banner,
 * and discourages converting failed/abandoned Razorpay drafts.
 */

const STYLE_ID = "oweg-draft-payment-status"
const BANNER_ATTR = "data-oweg-draft-payment-banner"
const BADGE_ATTR = "data-oweg-draft-payment-badge"
const CONVERT_WARN_ATTR = "data-oweg-draft-convert-warn"
const HIDDEN_CONVERT_ATTR = "data-oweg-convert-hidden"

type DraftMeta = {
  payment_method?: string
  checkout_status?: string
  razorpay_payment_status?: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  checkout_failed_at?: string
  cod_status?: string
}

type PaymentView = {
  kind: "failed" | "online_pending" | "cod_pending" | "unknown"
  label: string
  tone: "red" | "amber" | "blue" | "grey"
  detailLines: string[]
  blockConvert: boolean
}

let initialized = false
let applyTimer: number | null = null
let lastPath = ""
const draftCache = new Map<string, { at: number; metadata: DraftMeta; email?: string }>()
const CACHE_TTL_MS = 60_000

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    .oweg-pay-badge {
      display: inline-flex;
      align-items: center;
      margin-left: 0.5rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      vertical-align: middle;
    }
    .oweg-pay-badge--red {
      background: rgba(127, 29, 29, 0.55);
      color: #fecaca;
      box-shadow: inset 0 0 0 1px rgba(153, 27, 27, 0.55);
    }
    .oweg-pay-badge--amber {
      background: rgba(120, 53, 15, 0.5);
      color: #fde68a;
      box-shadow: inset 0 0 0 1px rgba(180, 83, 9, 0.55);
    }
    .oweg-pay-badge--blue {
      background: rgba(30, 58, 138, 0.5);
      color: #bfdbfe;
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.5);
    }
    .oweg-pay-badge--grey {
      background: rgba(55, 65, 81, 0.55);
      color: #e5e7eb;
      box-shadow: inset 0 0 0 1px rgba(75, 85, 99, 0.55);
    }
    .oweg-pay-banner {
      margin: 0 0 1rem 0;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      border: 1px solid;
    }
    .oweg-pay-banner--sidebar {
      margin: 1rem 0 0 0;
      width: 100%;
      box-sizing: border-box;
      word-break: break-word;
    }
    .oweg-pay-banner--red {
      background: #fef2f2;
      border-color: #fecaca;
      color: #7f1d1d;
    }
    .oweg-pay-banner--amber {
      background: #fffbeb;
      border-color: #fde68a;
      color: #78350f;
    }
    .oweg-pay-banner--blue {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1e3a8a;
    }
    .oweg-pay-banner--grey {
      background: #f9fafb;
      border-color: #e5e7eb;
      color: #374151;
    }
    .oweg-pay-banner__title {
      font-size: 0.875rem;
      font-weight: 700;
      margin: 0 0 0.35rem 0;
    }
    .oweg-pay-banner__line {
      font-size: 0.8125rem;
      margin: 0.15rem 0;
      opacity: 0.95;
    }
    .oweg-pay-banner__warn {
      margin-top: 0.65rem;
      font-size: 0.8125rem;
      font-weight: 600;
    }
    button[${HIDDEN_CONVERT_ATTR}="true"],
    a[${HIDDEN_CONVERT_ATTR}="true"] {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}

function normalizePath(pathname: string) {
  return pathname.replace(/\/$/, "") || "/"
}

function getDraftOrderIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  const idx = parts.indexOf("draft-orders")
  if (idx === -1) return null
  const id = parts[idx + 1]
  if (!id || id === "create") return null
  if (id.startsWith("order_")) return id
  return null
}

function isDraftListPath(pathname: string) {
  const path = normalizePath(pathname)
  return /\/draft-orders$/.test(path)
}

function isDraftDetailPath(pathname: string) {
  return Boolean(getDraftOrderIdFromPath(pathname))
}

function asMeta(raw: unknown): DraftMeta {
  if (!raw || typeof raw !== "object") return {}
  const m = raw as Record<string, unknown>
  const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : undefined)
  return {
    payment_method: str("payment_method"),
    checkout_status: str("checkout_status"),
    razorpay_payment_status: str("razorpay_payment_status"),
    razorpay_order_id: str("razorpay_order_id"),
    razorpay_payment_id: str("razorpay_payment_id"),
    checkout_failed_at: str("checkout_failed_at"),
    cod_status: str("cod_status"),
  }
}

function classifyPayment(meta: DraftMeta): PaymentView {
  const method = (meta.payment_method || "").toLowerCase().trim()
  const checkout = (meta.checkout_status || "").toLowerCase().trim()
  const rz = (meta.razorpay_payment_status || "").toLowerCase().trim()
  const cod = (meta.cod_status || "").toLowerCase().trim()

  const lines: string[] = []
  if (method) lines.push(`Payment method: ${method}`)
  if (meta.razorpay_order_id) lines.push(`Razorpay order: ${meta.razorpay_order_id}`)
  if (meta.razorpay_payment_id) lines.push(`Razorpay payment: ${meta.razorpay_payment_id}`)
  if (meta.checkout_failed_at) lines.push(`Failed at: ${meta.checkout_failed_at}`)
  if (rz) lines.push(`Razorpay status: ${rz}`)

  if (checkout === "payment_failed" || rz === "failed") {
    return {
      kind: "failed",
      label: "Payment failed",
      tone: "red",
      detailLines: lines.length
        ? lines
        : ["Online payment failed or was cancelled. Do not convert this draft."],
      blockConvert: true,
    }
  }

  if (method === "razorpay" || rz === "created") {
    return {
      kind: "online_pending",
      label: "Online payment incomplete",
      tone: "amber",
      detailLines: lines.length
        ? [...lines, "Customer abandoned checkout before capture. Do not convert to order."]
        : ["Online payment was started but not completed. Do not convert to order."],
      blockConvert: true,
    }
  }

  if (method === "cod" && cod !== "confirmed") {
    return {
      kind: "cod_pending",
      label: "COD pending confirm",
      tone: "blue",
      detailLines: [
        "Cash on delivery draft — waiting for customer COD confirmation.",
        ...(cod ? [`COD status: ${cod}`] : []),
      ],
      blockConvert: false,
    }
  }

  if (method === "cod" && cod === "confirmed") {
    return {
      kind: "unknown",
      label: "COD confirmed",
      tone: "blue",
      detailLines: ["COD already confirmed — should appear under Orders after convert."],
      blockConvert: false,
    }
  }

  return {
    kind: "unknown",
    label: "Checkout draft",
    tone: "grey",
    detailLines: method
      ? [`Payment method: ${method}`]
      : ["No payment metadata on this draft."],
    blockConvert: false,
  }
}

async function fetchDraftMeta(orderId: string): Promise<DraftMeta | null> {
  const cached = draftCache.get(orderId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.metadata
  }

  try {
    const res = await fetch(`/admin/draft-orders/${encodeURIComponent(orderId)}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    })
    if (!res.ok) {
      // Some installs expose drafts via /admin/orders/:id
      const res2 = await fetch(`/admin/orders/${encodeURIComponent(orderId)}`, {
        credentials: "include",
        headers: { accept: "application/json" },
      })
      if (!res2.ok) return null
      const data2 = await res2.json()
      const order2 = data2?.order || data2?.draft_order || data2
      const metadata = asMeta(order2?.metadata)
      draftCache.set(orderId, { at: Date.now(), metadata, email: order2?.email })
      return metadata
    }
    const data = await res.json()
    const order = data?.draft_order || data?.order || data
    const metadata = asMeta(order?.metadata)
    draftCache.set(orderId, { at: Date.now(), metadata, email: order?.email })
    return metadata
  } catch {
    return null
  }
}

async function fetchDraftListIndex(): Promise<Map<string, PaymentView>> {
  const index = new Map<string, PaymentView>()
  try {
    const res = await fetch(
      `/admin/draft-orders?limit=100&fields=id,display_id,email,metadata,status`,
      {
        credentials: "include",
        headers: { accept: "application/json" },
      }
    )
    if (!res.ok) return index
    const data = await res.json()
    const rows = (data?.draft_orders || data?.orders || []) as Array<{
      id?: string
      metadata?: unknown
    }>
    for (const row of rows) {
      if (!row?.id) continue
      const meta = asMeta(row.metadata)
      draftCache.set(row.id, { at: Date.now(), metadata: meta })
      index.set(row.id, classifyPayment(meta))
    }
  } catch {
    // ignore
  }
  return index
}

function makeBadge(view: PaymentView): HTMLSpanElement {
  const badge = document.createElement("span")
  badge.setAttribute(BADGE_ATTR, view.kind)
  badge.className = `oweg-pay-badge oweg-pay-badge--${view.tone}`
  badge.textContent = view.label
  badge.title = view.detailLines.join(" · ")
  return badge
}

function decorateList(index: Map<string, PaymentView>) {
  if (!isDraftListPath(window.location.pathname)) return

  const rows = document.querySelectorAll("table tbody tr")
  rows.forEach((row) => {
    const link = row.querySelector(
      'a[href*="/draft-orders/order_"]'
    ) as HTMLAnchorElement | null
    if (!link) return
    const href = link.getAttribute("href") || ""
    const orderId = href.split("/").filter(Boolean).pop()
    if (!orderId || !index.has(orderId)) return
    if (row.querySelector(`[${BADGE_ATTR}]`)) return

    const view = index.get(orderId)!
    link.insertAdjacentElement("afterend", makeBadge(view))
  })
}

function headingText(el: Element): string {
  return (el.textContent || "").trim().toLowerCase()
}

/** Locate the right-rail section that contains Activity / Contact / Shipping Address. */
function findActivitySection(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, span, div, p, button")
  )
  for (const el of candidates) {
    if (headingText(el) !== "activity") continue
    // Prefer a card/section wrapper around the Activity heading
    const section =
      (el.closest("section") as HTMLElement | null) ||
      (el.closest('[class*="shadow"]') as HTMLElement | null) ||
      (el.closest('[class*="rounded"]') as HTMLElement | null) ||
      (el.parentElement as HTMLElement | null)
    if (section) return section
  }
  return null
}

function findRightSidebarColumn(): HTMLElement | null {
  const activity = findActivitySection()
  if (activity?.parentElement) return activity.parentElement

  // Fallback: column that also contains Contact / Shipping Address
  const labels = ["contact", "shipping address", "activity"]
  for (const label of labels) {
    for (const el of Array.from(document.querySelectorAll("h1, h2, h3, h4, span, div, p"))) {
      const text = headingText(el)
      if (text !== label && !text.startsWith(label)) continue
      const col =
        (el.closest('[class*="xl:flex"]') as HTMLElement | null) ||
        (el.closest('[class*="flex-col"]') as HTMLElement | null) ||
        el.parentElement?.parentElement
      if (col) return col as HTMLElement
    }
  }
  return null
}

function buildPaymentCard(view: PaymentView): HTMLDivElement {
  const banner = document.createElement("div")
  banner.setAttribute(BANNER_ATTR, view.kind)
  banner.className = `oweg-pay-banner oweg-pay-banner--sidebar oweg-pay-banner--${view.tone}`

  const heading = document.createElement("p")
  heading.className = "oweg-pay-banner__title"
  heading.textContent = "Payment status"
  banner.appendChild(heading)

  const title = document.createElement("p")
  title.className = "oweg-pay-banner__title"
  title.style.fontWeight = "600"
  title.style.marginTop = "0.25rem"
  title.textContent = view.label
  banner.appendChild(title)

  for (const line of view.detailLines) {
    const p = document.createElement("p")
    p.className = "oweg-pay-banner__line"
    p.textContent = line
    banner.appendChild(p)
  }

  if (view.blockConvert) {
    const warn = document.createElement("p")
    warn.className = "oweg-pay-banner__warn"
    warn.textContent =
      "Convert disabled: this draft is a failed/incomplete Razorpay checkout. Do not convert to order."
    banner.appendChild(warn)
  }

  return banner
}

function injectDetailBanner(_orderId: string, view: PaymentView) {
  // Drop leftover main-column convert notes from the previous placement
  document.querySelector(`[${CONVERT_WARN_ATTR}]`)?.remove()

  const existing = document.querySelector(`[${BANNER_ATTR}]`) as HTMLElement | null
  const activity = findActivitySection()
  const sidebar = findRightSidebarColumn()

  // Already mounted in the right rail with the same status — avoid MutationObserver loops
  if (
    existing &&
    existing.getAttribute(BANNER_ATTR) === view.kind &&
    sidebar &&
    sidebar.contains(existing)
  ) {
    return
  }

  document.querySelectorAll(`[${BANNER_ATTR}]`).forEach((el) => el.remove())

  const banner = buildPaymentCard(view)

  if (activity?.parentElement) {
    // Mount directly under Activity in the right rail
    if (activity.nextSibling) {
      activity.parentElement.insertBefore(banner, activity.nextSibling)
    } else {
      activity.parentElement.appendChild(banner)
    }
    return
  }

  if (sidebar) {
    sidebar.appendChild(banner)
    return
  }

  // Last resort: still show somewhere on the page
  const main = document.querySelector("main") || document.body
  main.appendChild(banner)
}

function discourageConvert(view: PaymentView) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>("button, a")
  )
  for (const el of buttons) {
    const text = (el.textContent || "").trim().toLowerCase()
    if (!text.includes("convert to order")) continue

    if (view.blockConvert) {
      el.setAttribute(HIDDEN_CONVERT_ATTR, "true")
      el.setAttribute("aria-hidden", "true")
      el.setAttribute("tabindex", "-1")
    } else {
      el.removeAttribute(HIDDEN_CONVERT_ATTR)
    }
  }

  // Convert warning lives inside the sidebar payment card only
  document.querySelector(`[${CONVERT_WARN_ATTR}]`)?.remove()
}

async function applyDetail() {
  const orderId = getDraftOrderIdFromPath(window.location.pathname)
  if (!orderId) return

  const meta = await fetchDraftMeta(orderId)
  if (!meta) return
  const view = classifyPayment(meta)
  injectDetailBanner(orderId, view)
  discourageConvert(view)
}

async function applyList() {
  if (!isDraftListPath(window.location.pathname)) return
  const index = await fetchDraftListIndex()
  if (!index.size) return
  decorateList(index)
}

async function apply() {
  ensureStyles()
  const path = normalizePath(window.location.pathname)

  if (path !== lastPath) {
    lastPath = path
    document.querySelectorAll(`[${BANNER_ATTR}]`).forEach((el) => el.remove())
    document.querySelector(`[${CONVERT_WARN_ATTR}]`)?.remove()
  }

  if (isDraftDetailPath(path)) {
    await applyDetail()
    return
  }

  if (isDraftListPath(path)) {
    await applyList()
  }
}

function scheduleApply() {
  if (applyTimer !== null) window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => {
    applyTimer = null
    void apply()
  }, 120)
}

export function initDraftPaymentStatusUi() {
  if (typeof window === "undefined" || initialized) return
  initialized = true

  ensureStyles()
  scheduleApply()

  const observer = new MutationObserver(() => scheduleApply())
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener("popstate", scheduleApply)
  // SPA navigations often pushState without popstate
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
