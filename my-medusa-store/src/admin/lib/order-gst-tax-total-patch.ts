export type OrderGstPatchSummary = {
  taxable: number
  gst: number
  cgst: number
  sgst: number
  inclusive: number
  discount?: number
  gross_inclusive?: number
  lines?: Array<{ rate: number; tax_code?: string | null }>
}

const ROW_ATTR = "data-oweg-gst-row"
const PATCHED_ATTR = "data-oweg-gst-patched"
const VALUE_ATTR = "data-oweg-gst-value"
const LABEL_ATTR = "data-oweg-gst-label"

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function isTaxTotalLabel(text: string) {
  const n = normalizeText(text)
  return n === "tax total" || n === "gst (incl.)" || n === "gst (inclusive)"
}

function findLabelElement(): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll("body *")) as HTMLElement[]
  for (const el of nodes) {
    if (el.getAttribute(ROW_ATTR)) continue
    if (el.children.length > 0) continue
    if (!isTaxTotalLabel(el.textContent || "")) continue
    return el
  }
  return null
}

function findSummaryRow(labelEl: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = labelEl
  for (let depth = 0; depth < 6 && current; depth++) {
    const parent: HTMLElement | null = current.parentElement
    if (!parent) break
    const kids = Array.from(parent.children).filter(
      (child) => (child as HTMLElement).getAttribute?.(ROW_ATTR) !== "true"
    )
    if (kids.length >= 2 && parent.contains(labelEl)) {
      return parent
    }
    current = parent
  }
  return labelEl.parentElement
}

function findValueElement(row: HTMLElement, labelEl: HTMLElement): HTMLElement | null {
  const existing = row.querySelector(`[${VALUE_ATTR}="true"]`) as HTMLElement | null
  if (existing) return existing

  const candidates = Array.from(row.querySelectorAll("*")) as HTMLElement[]
  const leaves = candidates.filter((el) => el.children.length === 0 && el !== labelEl)
  if (!leaves.length) {
    const kids = Array.from(row.children) as HTMLElement[]
    return kids.find((kid) => kid !== labelEl && !kid.contains(labelEl)) || null
  }

  // Prefer the rightmost leaf that looks like money / number
  const moneyLike = leaves.filter((el) => /[₹$€£]|^\s*[\d.,]+\s*$/.test(el.textContent || ""))
  return moneyLike[moneyLike.length - 1] || leaves[leaves.length - 1] || null
}

function removeInjectedRows(anchorRow: HTMLElement) {
  let next = anchorRow.nextElementSibling as HTMLElement | null
  while (next && next.getAttribute(ROW_ATTR) === "true") {
    const remove = next
    next = next.nextElementSibling as HTMLElement | null
    remove.remove()
  }
}

function cloneRow(template: HTMLElement, label: string, value: string): HTMLElement {
  const row = template.cloneNode(true) as HTMLElement
  row.setAttribute(ROW_ATTR, "true")
  row.removeAttribute(PATCHED_ATTR)

  const leaves = Array.from(row.querySelectorAll("*")).filter(
    (el) => (el as HTMLElement).children.length === 0
  ) as HTMLElement[]

  if (leaves.length >= 2) {
    leaves[0].textContent = label
    leaves[0].setAttribute(LABEL_ATTR, "true")
    leaves[leaves.length - 1].textContent = value
    leaves[leaves.length - 1].setAttribute(VALUE_ATTR, "true")
  } else {
    row.textContent = `${label} ${value}`
  }

  return row
}

function rateHint(summary: OrderGstPatchSummary): string {
  const rates = Array.from(
    new Set(
      (summary.lines || [])
        .map((line) => Number(line.rate) || 0)
        .filter((rate) => rate > 0)
    )
  )
  if (rates.length === 1) return ` @ ${rates[0]}%`
  if (rates.length > 1) return " (mixed)"
  return ""
}

export function patchOrderTaxTotal(summary: OrderGstPatchSummary): boolean {
  const labelEl = findLabelElement()
  if (!labelEl) return false

  const row = findSummaryRow(labelEl)
  if (!row) return false

  const valueEl = findValueElement(row, labelEl)
  if (!valueEl) return false

  const label = `GST (incl.)${rateHint(summary)}`
  const value = formatMoney(summary.gst)

  if (
    labelEl.getAttribute(PATCHED_ATTR) === "true" &&
    labelEl.textContent === label &&
    valueEl.textContent === value &&
    row.nextElementSibling?.getAttribute(ROW_ATTR) === "true"
  ) {
    return true
  }

  // Drop any orphaned injected rows from prior React re-renders
  document.querySelectorAll(`[${ROW_ATTR}="true"]`).forEach((el) => el.remove())

  labelEl.textContent = label
  labelEl.setAttribute(PATCHED_ATTR, "true")
  labelEl.title = "GST included in item prices (not added on top)"

  valueEl.textContent = value
  valueEl.setAttribute(VALUE_ATTR, "true")
  valueEl.setAttribute(PATCHED_ATTR, "true")
  valueEl.title = `Taxable ${formatMoney(summary.taxable)} · CGST ${formatMoney(summary.cgst)} · SGST ${formatMoney(summary.sgst)}`

  row.setAttribute(PATCHED_ATTR, "true")
  removeInjectedRows(row)

  const extras: Array<[string, string]> = []
  if ((summary.discount || 0) > 0) {
    extras.push(["Less: discount (coin/promo)", `-${formatMoney(summary.discount || 0)}`])
  }
  extras.push(
    ["Taxable value", formatMoney(summary.taxable)],
    ["CGST", formatMoney(summary.cgst)],
    ["SGST", formatMoney(summary.sgst)]
  )

  let insertAfter: HTMLElement = row
  for (const [extraLabel, extraValue] of extras) {
    const extraRow = cloneRow(row, extraLabel, extraValue)
    insertAfter.insertAdjacentElement("afterend", extraRow)
    insertAfter = extraRow
  }

  return true
}

export function cleanupOrderGstPatch() {
  document.querySelectorAll(`[${ROW_ATTR}="true"]`).forEach((el) => el.remove())

  document.querySelectorAll(`[${PATCHED_ATTR}="true"]`).forEach((el) => {
    const node = el as HTMLElement
    if (isTaxTotalLabel(node.textContent || "") || normalizeText(node.textContent).startsWith("gst (incl")) {
      node.textContent = "Tax Total"
    }
    node.removeAttribute(PATCHED_ATTR)
    node.removeAttribute(VALUE_ATTR)
    node.removeAttribute(LABEL_ATTR)
    node.removeAttribute("title")
  })
}

export function mountOrderGstTaxTotalPatch(summary: OrderGstPatchSummary) {
  let frame = 0
  let patching = false

  const apply = () => {
    if (patching) return
    patching = true
    try {
      patchOrderTaxTotal(summary)
    } finally {
      patching = false
    }
  }

  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(apply)
  }

  apply()
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    cleanupOrderGstPatch()
  }
}
