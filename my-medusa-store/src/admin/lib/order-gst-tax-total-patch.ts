/**
 * Patch Medusa order Summary:
 * - Rename "Tax Total" → "GST (incl.)"
 * - Inject tax breakdown, vendor settlement, and coin discount rows
 */

export type OrderVendorSettlementPatch = {
  taxable_amount: number
  commission_rate: number
  commission_amount: number
  tcs_rate: number
  tcs_amount: number
  tds_rate: number
  tds_amount: number
  net_amount: number
  vendor_name?: string | null
  platform_rate?: number
  platform_amount?: number
  partner_rate?: number
  partner_amount?: number
  partner_name?: string | null
  logistic_amount?: number
  listing_total?: number
}

export type OrderPartnerSalePatch = {
  code: string
  name?: string | null
  email?: string | null
  commission_amount?: number
  commission_rate?: number | null
  status?: string | null
}

export type OrderGstPatchSummary = {
  taxable: number
  gst: number
  cgst: number
  sgst: number
  inclusive: number
  discount?: number
  gross_inclusive?: number
  lines?: Array<{ rate: number; tax_code?: string | null }>
  vendor_settlement?: OrderVendorSettlementPatch | null
  partner_sale?: OrderPartnerSalePatch | null
  coin_discount?: number
  coin_discount_code?: string | null
}

const ROW_ATTR = "data-oweg-gst-row"
const PATCHED_ATTR = "data-oweg-gst-patched"
const VALUE_ATTR = "data-oweg-gst-value"
const LABEL_ATTR = "data-oweg-gst-label"
const BLOCK_ATTR = "data-oweg-summary-block"
const SIGNATURE_ATTR = "data-oweg-gst-signature"

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
  return (
    n === "tax total" ||
    n === "gst (incl.)" ||
    n.startsWith("gst (incl.)") ||
    n === "gst (inclusive)"
  )
}

function findLabelElement(): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll("body *")) as HTMLElement[]
  for (const el of nodes) {
    if (el.getAttribute(ROW_ATTR)) continue
    if (el.getAttribute(BLOCK_ATTR)) continue
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

  const moneyLike = leaves.filter((el) => /[₹$€£]|^\s*[\d.,]+\s*$/.test(el.textContent || ""))
  return moneyLike[moneyLike.length - 1] || leaves[leaves.length - 1] || null
}

function removeInjectedAfter(anchorRow: HTMLElement) {
  let next = anchorRow.nextElementSibling as HTMLElement | null
  while (
    next &&
    (next.getAttribute(ROW_ATTR) === "true" || next.getAttribute(BLOCK_ATTR) === "true")
  ) {
    const remove = next
    next = next.nextElementSibling as HTMLElement | null
    remove.remove()
  }
}

function cloneRow(template: HTMLElement, label: string, value: string): HTMLElement {
  const row = template.cloneNode(true) as HTMLElement
  row.setAttribute(ROW_ATTR, "true")
  row.removeAttribute(PATCHED_ATTR)
  row.removeAttribute(SIGNATURE_ATTR)

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

function createSectionLabel(template: HTMLElement, text: string): HTMLElement {
  const row = template.cloneNode(true) as HTMLElement
  row.setAttribute(BLOCK_ATTR, "true")
  row.setAttribute(ROW_ATTR, "true")
  row.removeAttribute(PATCHED_ATTR)
  row.removeAttribute(SIGNATURE_ATTR)

  const leaves = Array.from(row.querySelectorAll("*")).filter(
    (el) => (el as HTMLElement).children.length === 0
  ) as HTMLElement[]

  if (leaves.length >= 2) {
    leaves[0].textContent = text
    leaves[0].style.fontWeight = "600"
    leaves[0].style.textTransform = "uppercase"
    leaves[0].style.letterSpacing = "0.04em"
    leaves[0].style.fontSize = "0.7rem"
    leaves[leaves.length - 1].textContent = ""
  } else {
    row.textContent = text
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

function buildExtras(summary: OrderGstPatchSummary): Array<[string, string] | { section: string }> {
  const extras: Array<[string, string] | { section: string }> = []
  const coin = Number(summary.coin_discount) || 0

  extras.push({ section: "Tax breakdown" })
  extras.push(
    ["Taxable value", formatMoney(summary.taxable)],
    ["CGST", formatMoney(summary.cgst)],
    ["SGST", formatMoney(summary.sgst)]
  )

  if ((summary.discount || 0) > 0 && coin <= 0) {
    extras.push(["Discounts applied", `−${formatMoney(summary.discount || 0)}`])
  }

  if (coin > 0) {
    extras.push({ section: "Coin discount" })
    const code = summary.coin_discount_code
      ? ` (${summary.coin_discount_code})`
      : ""
    extras.push([`Coin discount${code}`, `−${formatMoney(coin)}`])
  }

  const partner = summary.partner_sale
  if (partner?.code) {
    const who = partner.name ? `${partner.name} (${partner.code})` : partner.code
    extras.push({ section: "Partner sale" })
    extras.push(["Partner", who])
    if (partner.email) {
      extras.push(["Partner email", partner.email])
    }
    const partnerAmt = Number(partner.commission_amount) || 0
    if (partnerAmt > 0) {
      const rate =
        partner.commission_rate != null && Number(partner.commission_rate) > 0
          ? ` @ ${Number(partner.commission_rate)}%`
          : ""
      extras.push([`Partner commission${rate}`, formatMoney(partnerAmt)])
    }
    if (partner.status) {
      extras.push(["Partner status", String(partner.status)])
    }
  }

  const settlement = summary.vendor_settlement
  if (settlement) {
    const vendorHint = settlement.vendor_name ? ` · ${settlement.vendor_name}` : ""
    extras.push({ section: `Vendor payout${vendorHint}` })

    const platformAmt = Number(settlement.platform_amount) || 0
    if (platformAmt > 0) {
      extras.push([
        `Platform @ ${Number(settlement.platform_rate) || 0}% (incl. GST)`,
        `−${formatMoney(platformAmt)}`,
      ])
    }

    extras.push([
      `Commission @ ${Number(settlement.commission_rate) || 0}% (incl. GST)`,
      `−${formatMoney(settlement.commission_amount)}`,
    ])

    const partnerAmt = Number(settlement.partner_amount) || 0
    if (partnerAmt > 0) {
      const partnerLabel = settlement.partner_name
        ? `Partner @ ${Number(settlement.partner_rate) || 0}% · ${settlement.partner_name} (incl. GST)`
        : `Partner @ ${Number(settlement.partner_rate) || 0}% (incl. GST)`
      extras.push([partnerLabel, `−${formatMoney(partnerAmt)}`])
    }

    const logisticAmt = Number(settlement.logistic_amount) || 0
    if (logisticAmt > 0) {
      extras.push([`Logistics (incl. GST)`, `−${formatMoney(logisticAmt)}`])
    }

    extras.push(
      [
        `TCS @ ${Number(settlement.tcs_rate) || 0}%`,
        `−${formatMoney(settlement.tcs_amount)}`,
      ],
      [
        `TDS @ ${Number(settlement.tds_rate) || 0}%`,
        `−${formatMoney(settlement.tds_amount)}`,
      ],
      ["Bank settlement (net to vendor)", formatMoney(settlement.net_amount)]
    )
  }

  return extras
}

function signatureFor(summary: OrderGstPatchSummary, label: string, value: string) {
  return JSON.stringify({
    label,
    value,
    extras: buildExtras(summary),
  })
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
  const signature = signatureFor(summary, label, value)

  if (
    row.getAttribute(SIGNATURE_ATTR) === signature &&
    row.nextElementSibling?.getAttribute(ROW_ATTR) === "true"
  ) {
    return true
  }

  // Drop orphaned injected rows from prior React re-renders
  document.querySelectorAll(`[${ROW_ATTR}="true"]`).forEach((el) => el.remove())
  document.querySelectorAll(`[${BLOCK_ATTR}="true"]`).forEach((el) => el.remove())

  labelEl.textContent = label
  labelEl.setAttribute(PATCHED_ATTR, "true")
  labelEl.title = "GST included in item prices (not added on top)"

  valueEl.textContent = value
  valueEl.setAttribute(VALUE_ATTR, "true")
  valueEl.setAttribute(PATCHED_ATTR, "true")
  valueEl.title = `Taxable ${formatMoney(summary.taxable)} · CGST ${formatMoney(summary.cgst)} · SGST ${formatMoney(summary.sgst)}`

  row.setAttribute(PATCHED_ATTR, "true")
  row.setAttribute(SIGNATURE_ATTR, signature)
  removeInjectedAfter(row)

  let insertAfter: HTMLElement = row
  for (const item of buildExtras(summary)) {
    const extraRow =
      "section" in item
        ? createSectionLabel(row, item.section)
        : cloneRow(row, item[0], item[1])
    insertAfter.insertAdjacentElement("afterend", extraRow)
    insertAfter = extraRow
  }

  return true
}

export function cleanupOrderGstPatch() {
  document.querySelectorAll(`[${ROW_ATTR}="true"]`).forEach((el) => el.remove())
  document.querySelectorAll(`[${BLOCK_ATTR}="true"]`).forEach((el) => el.remove())

  document.querySelectorAll(`[${PATCHED_ATTR}="true"]`).forEach((el) => {
    const node = el as HTMLElement
    if (
      isTaxTotalLabel(node.textContent || "") ||
      normalizeText(node.textContent).startsWith("gst (incl")
    ) {
      node.textContent = "Tax Total"
    }
    node.removeAttribute(PATCHED_ATTR)
    node.removeAttribute(VALUE_ATTR)
    node.removeAttribute(SIGNATURE_ATTR)
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
