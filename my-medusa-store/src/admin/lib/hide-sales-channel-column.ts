const STYLE_ID = "oweg-hide-sales-channel-column"
const HIDDEN_ATTR = "data-oweg-hidden-sales-channel"

type ListPage = "orders" | "products"

function getActiveListPage(pathname: string): ListPage | null {
  const path = pathname.replace(/\/$/, "")
  if (path.endsWith("/orders") || path.endsWith("/app/orders")) return "orders"
  if (path.endsWith("/products") || path.endsWith("/app/products")) return "products"
  return null
}

function isSalesChannelHeader(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase()
  return (
    normalized === "sales channel" ||
    normalized === "sales channels" ||
    normalized.includes("sales channel")
  )
}

function detectSalesChannelColumnIndex(table: HTMLTableElement): number | null {
  const headerCells = Array.from(table.querySelectorAll("thead th"))
  const index = headerCells.findIndex((th) => isSalesChannelHeader(th.textContent || ""))
  return index >= 0 ? index : null
}

function ensureStyles(page: ListPage | null) {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = STYLE_ID
    document.head.appendChild(styleEl)
  }

  const orderLinkRules =
    page === "orders"
      ? `
    table tbody tr a[href*="/orders/order_"],
    table tbody tr a[href*="/orders/order_"]:hover,
    table tbody tr a[href*="/orders/order_"]:focus,
    table tbody tr a[href*="/orders/order_"]:focus-visible,
    table tbody tr a[href*="/orders/order_"]:active {
      text-decoration: none !important;
      border: none !important;
      box-shadow: none !important;
      outline: none !important;
    }
  `
      : ""

  styleEl.textContent = `
    th[${HIDDEN_ATTR}="true"],
    td[${HIDDEN_ATTR}="true"] {
      display: none !important;
      width: 0 !important;
      max-width: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      overflow: hidden !important;
    }

    ${orderLinkRules}

    table tbody tr td {
      border-bottom-color: rgba(255, 255, 255, 0.08) !important;
    }
  `
}

function hideSalesChannelInTable(table: HTMLTableElement) {
  const columnIndex = detectSalesChannelColumnIndex(table)
  if (columnIndex == null) return

  const selector = `thead tr th:nth-child(${columnIndex + 1}), tbody tr td:nth-child(${columnIndex + 1})`
  table.querySelectorAll(selector).forEach((cell) => {
    cell.setAttribute(HIDDEN_ATTR, "true")
  })
}

export function syncHideSalesChannelColumn() {
  if (typeof window === "undefined") return

  const page = getActiveListPage(window.location.pathname)
  if (!page) return

  ensureStyles(page)

  document.querySelectorAll("table").forEach((table) => {
    hideSalesChannelInTable(table)
  })
}

export function mountHideSalesChannelColumn() {
  if (typeof window === "undefined") return () => undefined

  syncHideSalesChannelColumn()

  const observer = new MutationObserver(() => {
    syncHideSalesChannelColumn()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    document.getElementById(STYLE_ID)?.remove()
    document
      .querySelectorAll(`[${HIDDEN_ATTR}="true"]`)
      .forEach((el) => el.removeAttribute(HIDDEN_ATTR))
  }
}
