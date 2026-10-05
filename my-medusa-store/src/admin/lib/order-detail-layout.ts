/**
 * Order detail layout polish (DOM):
 * 1) Move Metadata + JSON to the true page bottom (below both columns)
 * 2) Pin Cancellation → Vendors → Coin Discount under Activity on the right
 */

const INIT_KEY = "__owegOrderDetailLayoutInit"
const STYLE_ID = "oweg-order-detail-layout"

function isOrderDetailPath(pathname = window.location.pathname) {
  return /\/app\/orders\/order_[A-Z0-9]+/i.test(pathname)
}

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = `
    [data-oweg-order-extra="true"] {
      width: 100%;
      display: flex !important;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.25rem;
    }
  `
}

function headingText(el: Element | null | undefined) {
  return String(el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function findSectionByHeading(label: string): HTMLElement | null {
  const want = label.toLowerCase()
  const headings = Array.from(
    document.querySelectorAll("h1, h2, h3")
  ) as HTMLElement[]
  for (const h of headings) {
    if (headingText(h) !== want) continue
    const card =
      (h.closest('[class*="shadow-elevation-card"]') as HTMLElement | null) ||
      (h.closest('[class*="rounded-xl"]') as HTMLElement | null) ||
      (h.closest('[class*="rounded-lg"]') as HTMLElement | null) ||
      (h.parentElement?.parentElement as HTMLElement | null)
    if (card) return card
  }
  return null
}

function findPageRoot(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll("div.flex.w-full.flex-col.gap-y-3")
  ) as HTMLElement[]
  for (const el of candidates) {
    const grid = el.querySelector(
      ":scope > div.flex.w-full.flex-col.items-start"
    )
    if (grid) return el
  }
  return null
}

function findColumnGrid(pageRoot: HTMLElement): HTMLElement | null {
  return pageRoot.querySelector(
    ":scope > div.flex.w-full.flex-col.items-start"
  ) as HTMLElement | null
}

function moveMetadataJsonToBottom() {
  const pageRoot = findPageRoot()
  if (!pageRoot) return
  const grid = findColumnGrid(pageRoot)
  if (!grid) return

  const meta = findSectionByHeading("metadata")
  const json = findSectionByHeading("json")
  if (!meta && !json) return

  let wrapper: HTMLElement | null = null
  if (meta?.parentElement && json && meta.parentElement.contains(json)) {
    wrapper = meta.parentElement
  } else if (json?.parentElement && meta && json.parentElement.contains(meta)) {
    wrapper = json.parentElement
  }

  let bottom = pageRoot.querySelector(
    ':scope > [data-oweg-order-extra="true"]'
  ) as HTMLElement | null

  if (!bottom) {
    bottom = document.createElement("div")
    bottom.setAttribute("data-oweg-order-extra", "true")
    if (grid.nextSibling) pageRoot.insertBefore(bottom, grid.nextSibling)
    else pageRoot.appendChild(bottom)
  }

  if (wrapper && wrapper !== bottom && !bottom.contains(wrapper)) {
    while (wrapper.firstChild) bottom.appendChild(wrapper.firstChild)
    wrapper.remove()
  } else {
    if (meta && meta.parentElement !== bottom) bottom.appendChild(meta)
    if (json && json.parentElement !== bottom) bottom.appendChild(json)
  }

  // Drop duplicate Metadata/JSON cards left in either column
  document.querySelectorAll("h2").forEach((h) => {
    const t = headingText(h)
    if (t !== "metadata" && t !== "json") return
    const card =
      (h.closest('[class*="shadow-elevation-card"]') as HTMLElement | null) ||
      (h.closest('[class*="rounded-lg"]') as HTMLElement | null) ||
      (h.closest('[class*="rounded-xl"]') as HTMLElement | null)
    if (!card || bottom!.contains(card)) return
    const parent = card.parentElement
    card.remove()
    if (
      parent &&
      parent !== bottom &&
      parent !== grid &&
      parent.childElementCount === 0
    ) {
      parent.remove()
    }
  })
}

const SIDE_ORDER = [
  ["cancellation", "cancelled", "canceled"],
  ["vendors", "vendor"],
] as const

function matchSideKey(title: string): number {
  return SIDE_ORDER.findIndex((aliases) =>
    aliases.some(
      (key) => title === key || title.startsWith(key) || title.includes(key)
    )
  )
}

function cardTitle(card: HTMLElement) {
  const h = card.querySelector("h1, h2, h3")
  if (h) return headingText(h)
  // Coin Discount (and similar) use a bold div, not a Heading
  const bold = card.querySelector(
    ".text-sm.font-semibold, [class*='font-semibold'], [class*='font-medium']"
  )
  return headingText(bold) || headingText(card.firstElementChild as Element)
}

function reorderSideRail() {
  const pageRoot = findPageRoot()
  if (!pageRoot) return
  const grid = findColumnGrid(pageRoot)
  if (!grid) return

  const columns = Array.from(grid.children) as HTMLElement[]
  const sideCol = columns[1]
  if (!sideCol) return

  const cards = Array.from(sideCol.children) as HTMLElement[]
  const ranked: Array<{ el: HTMLElement; rank: number }> = []

  for (const card of cards) {
    const idx = matchSideKey(cardTitle(card))
    if (idx >= 0) ranked.push({ el: card, rank: idx })
  }

  if (ranked.length < 2) return
  ranked.sort((a, b) => a.rank - b.rank)

  // Place directly under Activity (or Customer if Activity missing)
  const activity = findSectionByHeading("activity")
  const customer = findSectionByHeading("customer")
  const anchor =
    (activity && sideCol.contains(activity) && activity) ||
    (customer && sideCol.contains(customer) && customer) ||
    null

  let insertAfter: HTMLElement | null = anchor
  for (const { el } of ranked) {
    if (insertAfter) {
      insertAfter.insertAdjacentElement("afterend", el)
      insertAfter = el
    } else {
      sideCol.appendChild(el)
      insertAfter = el
    }
  }
}

function apply() {
  if (!isOrderDetailPath()) return
  ensureStyles()
  moveMetadataJsonToBottom()
  reorderSideRail()
}

let timer: number | null = null
let applying = false

function schedule() {
  if (timer != null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    if (applying) return
    applying = true
    try {
      apply()
    } finally {
      applying = false
    }
  }, 120)
}

export function initOrderDetailLayout() {
  if (typeof window === "undefined") return
  const w = window as Window & { [INIT_KEY]?: boolean }
  if (w[INIT_KEY]) return
  w[INIT_KEY] = true

  ensureStyles()
  apply()

  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })

  window.addEventListener("popstate", schedule)
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  history.pushState = (...args) => {
    push(...args)
    schedule()
  }
  history.replaceState = (...args) => {
    replace(...args)
    schedule()
  }
}
