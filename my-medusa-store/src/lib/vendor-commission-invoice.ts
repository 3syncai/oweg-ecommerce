import type { Pool } from "pg"

const SERVICE_GST_RATE = 18

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export type CommissionInvoicePlatform = {
  name: string
  address: string
  phone: string
  email: string
  gstin: string
  pan: string
}

export type CommissionInvoiceVendor = {
  display_name: string
  business_name: string
  address: string
  place_of_supply: string
  phone: string
  email: string
  gstin: string | null
  pan: string | null
}

export type CommissionInvoiceOrderLine = {
  order_id: string
  order_display_id: string | number | null
  product_name: string
  delivered_at: string | null
  category: "sale" | "return" | "cancellation"
  status: string
  sale_amount: number
  taxable_amount: number
  product_gst_rate: number
  product_gst: number
  listing_total: number
  logistic_fee: number
  logistic_gst: number
  platform_fee: number
  platform_gst: number
  commission_rate: number
  commission_amount: number
  commission_gst: number
  partner_commission: number
  partner_gst: number
  tcs: number
  tds: number
  return_fee: number
  reverse_logistic_gst: number
  cancellation_fee: number
  invoice_date: string | null
}

export type CommissionInvoiceServiceLine = {
  sac: string
  description: string
  net_taxable: number
  gst_rate: number
  gst_amount: number
  total: number
}

export type CommissionInvoiceFeeSummary = {
  sale_amount: number
  product_gst: number
  logistic_fee: number
  platform_fee: number
  platform_gst: number
  commission: number
  commission_gst: number
  partner: number
  partner_gst: number
  tcs: number
  tds: number
  reverse_logistic: number
  cancellation_fee: number
}

export type CommissionInvoicePayload = {
  invoice_title: string
  invoice_number: string
  invoice_date: string
  period_label: string
  period_from: string | null
  period_to: string | null
  period_key: string | null
  auto_generated: boolean
  billed_from: CommissionInvoicePlatform
  billed_to: CommissionInvoiceVendor
  orders: CommissionInvoiceOrderLine[]
  service_lines: CommissionInvoiceServiceLine[]
  fee_summary: CommissionInvoiceFeeSummary
  totals: {
    net_taxable: number
    gst_amount: number
    grand_total: number
  }
}

export function getCommissionInvoicePlatform(): CommissionInvoicePlatform {
  return {
    name:
      process.env.COMMISSION_INVOICE_SELLER_NAME ||
      process.env.INVOICE_SELLER_LEGAL ||
      "Ascent Retechno India Pvt Ltd",
    address:
      process.env.COMMISSION_INVOICE_SELLER_ADDRESS ||
      process.env.INVOICE_SELLER_ADDRESS ||
      "AV PRIDE, B-12, GROUND FLOOR, OPP. RAHUL INTERNATIONAL SCHOOL, NILEMORE, 4th Road, NALASOPARA WEST, THANE, MAHARASHTRA – 401203",
    phone:
      process.env.COMMISSION_INVOICE_SELLER_PHONE ||
      process.env.INVOICE_SELLER_PHONE ||
      "+91 8797787877",
    email:
      process.env.COMMISSION_INVOICE_SELLER_EMAIL ||
      process.env.INVOICE_SELLER_EMAIL ||
      "owegonline@oweg.in",
    gstin:
      process.env.COMMISSION_INVOICE_SELLER_GSTIN ||
      process.env.INVOICE_SELLER_GST ||
      "27AAWCA5289L1ZO",
    pan:
      process.env.COMMISSION_INVOICE_SELLER_PAN ||
      process.env.INVOICE_SELLER_PAN ||
      "AAWCA5289L",
  }
}

function buildVendorAddress(vendor: Record<string, unknown>): string {
  const parts = [
    vendor.store_address,
    vendor.store_city,
    vendor.store_region,
    vendor.store_pincode,
    vendor.store_country,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean)
  return parts.join(", ") || "—"
}

function stateSupplyLabel(region: unknown, country: unknown): string {
  const state = String(region || "Maharashtra").trim().toUpperCase()
  const c = String(country || "IN").trim().toUpperCase()
  const code =
    state === "MAHARASHTRA"
      ? "IN-MH"
      : state === "DELHI"
        ? "IN-DL"
        : state === "KARNATAKA"
          ? "IN-KA"
          : `${c}-${state.slice(0, 2)}`
  return `${state}, ${code}`
}

function serviceLine(
  sac: string,
  description: string,
  netTaxable: number,
  gstRate = SERVICE_GST_RATE
): CommissionInvoiceServiceLine {
  const net = round2(Math.max(0, netTaxable))
  const gstAmount = round2((net * gstRate) / 100)
  return {
    sac,
    description,
    net_taxable: net,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    total: round2(net + gstAmount),
  }
}

function istDayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function startIst(d: Date) {
  return new Date(`${istDayKey(d)}T00:00:00+05:30`)
}

function endIst(d: Date) {
  return new Date(`${istDayKey(d)}T23:59:59.999+05:30`)
}

/** Previous calendar month in Asia/Kolkata. */
export function previousCalendarMonthWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === "year")?.value)
  const month = Number(parts.find((p) => p.type === "month")?.value)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return calendarMonthWindow(prevYear, prevMonth)
}

/** Specific calendar month (1–12) in Asia/Kolkata. */
export function calendarMonthWindow(year: number, month: number) {
  const y = Math.trunc(year)
  const m = Math.trunc(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return {
      from: null as Date | null,
      to: null as Date | null,
      label: "Invalid month",
      periodKey: null as string | null,
      error: "Invalid year or month",
    }
  }
  const from = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+05:30`)
  const lastDay = new Date(y, m, 0).getDate()
  const to = new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999+05:30`
  )
  const periodKey = `${y}-${String(m).padStart(2, "0")}`
  const label = from.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
  return { from, to, label: `Monthly · ${label}`, periodKey, error: undefined as string | undefined }
}

export type CommissionInvoiceRange =
  | "today"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "last_month"
  | "month"
  | "custom"
  | "all"

export function resolveCommissionInvoiceWindow(
  range: CommissionInvoiceRange,
  fromRaw?: string,
  toRaw?: string,
  monthRaw?: string,
  yearRaw?: string
): {
  from: Date | null
  to: Date | null
  label: string
  periodKey: string | null
  error?: string
} {
  const now = new Date()

  if (range === "all") {
    return { from: null, to: null, label: "All time", periodKey: null }
  }

  if (range === "last_month") {
    const month = previousCalendarMonthWindow(now)
    return {
      from: month.from,
      to: month.to,
      label: month.label,
      periodKey: month.periodKey,
    }
  }

  if (range === "month") {
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const window = calendarMonthWindow(year, month)
    if (window.error) {
      return {
        from: null,
        to: null,
        label: "Month",
        periodKey: null,
        error: window.error,
      }
    }
    return {
      from: window.from,
      to: window.to,
      label: window.label,
      periodKey: window.periodKey,
    }
  }

  const to = endIst(now)

  if (range === "today") {
    return { from: startIst(now), to, label: "Today", periodKey: istDayKey(now) }
  }

  if (range === "1m" || range === "3m" || range === "6m" || range === "1y") {
    const from = startIst(now)
    if (range === "1m") from.setMonth(from.getMonth() - 1)
    else if (range === "3m") from.setMonth(from.getMonth() - 3)
    else if (range === "6m") from.setMonth(from.getMonth() - 6)
    else from.setFullYear(from.getFullYear() - 1)
    const labels = {
      "1m": "Last month",
      "3m": "Last 3 months",
      "6m": "Last 6 months",
      "1y": "Yearly",
    } as const
    return { from, to, label: labels[range], periodKey: null }
  }

  if (!fromRaw || !toRaw) {
    return {
      from: null,
      to: null,
      label: "Custom",
      periodKey: null,
      error: "from and to dates are required",
    }
  }

  const from = new Date(`${fromRaw}T00:00:00+05:30`)
  const customTo = new Date(`${toRaw}T23:59:59.999+05:30`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(customTo.getTime())) {
    return {
      from: null,
      to: null,
      label: "Custom",
      periodKey: null,
      error: "Invalid date range",
    }
  }
  if (from.getTime() > customTo.getTime()) {
    return {
      from: null,
      to: null,
      label: "Custom",
      periodKey: null,
      error: "From date must be before To date",
    }
  }

  return {
    from,
    to: customTo,
    label: `${fromRaw} to ${toRaw}`,
    periodKey: null,
  }
}

function classifyOrder(row: {
  status: string
  cancellation_fee: number
  return_fee: number
  sale_amount: number
}): "sale" | "return" | "cancellation" {
  const status = String(row.status || "").toUpperCase()
  if (status === "REVERSED") return "return"
  if (row.cancellation_fee > 0 && Math.abs(row.sale_amount) < 0.01) return "cancellation"
  if (row.return_fee > 0 && row.sale_amount < 0) return "return"
  return "sale"
}

export function buildServiceLinesFromOrders(
  orders: CommissionInvoiceOrderLine[]
): CommissionInvoiceServiceLine[] {
  const sum = (pick: (o: CommissionInvoiceOrderLine) => number) =>
    round2(orders.reduce((acc, row) => acc + Math.abs(pick(row)), 0))

  const lines: CommissionInvoiceServiceLine[] = []
  const commission = sum((o) => o.commission_amount)
  const platform = sum((o) => o.platform_fee)
  const partner = sum((o) => o.partner_commission)
  const logistics = sum((o) => o.logistic_fee)
  const reverse = sum((o) => o.return_fee)
  const cancel = sum((o) => o.cancellation_fee)
  const tcs = sum((o) => o.tcs)
  const tds = sum((o) => o.tds)

  if (commission > 0) lines.push(serviceLine("998599", "Commission Fee", commission))
  if (platform > 0) lines.push(serviceLine("998599", "Platform Fee", platform))
  if (partner > 0) lines.push(serviceLine("998599", "Partner Commission", partner))
  if (logistics > 0) lines.push(serviceLine("996812", "Logistics / Shipping Fee", logistics))
  if (reverse > 0) lines.push(serviceLine("996812", "Reverse Logistics Fee", reverse))
  if (cancel > 0) lines.push(serviceLine("998599", "Cancellation Fee", cancel))
  if (tcs > 0) lines.push(serviceLine("998599", "TCS @0.5%", tcs, 0))
  if (tds > 0) lines.push(serviceLine("998599", "TDS @0.1%", tds, 0))

  return lines
}

export function buildFeeSummary(
  orders: CommissionInvoiceOrderLine[]
): CommissionInvoiceFeeSummary {
  const sum = (pick: (o: CommissionInvoiceOrderLine) => number) =>
    round2(orders.reduce((acc, row) => acc + pick(row), 0))

  return {
    sale_amount: sum((o) => o.sale_amount),
    product_gst: sum((o) => o.product_gst),
    logistic_fee: sum((o) => Math.abs(o.logistic_fee)),
    platform_fee: sum((o) => Math.abs(o.platform_fee)),
    platform_gst: sum((o) => Math.abs(o.platform_gst)),
    commission: sum((o) => Math.abs(o.commission_amount)),
    commission_gst: sum((o) => Math.abs(o.commission_gst)),
    partner: sum((o) => Math.abs(o.partner_commission)),
    partner_gst: sum((o) => Math.abs(o.partner_gst)),
    tcs: sum((o) => Math.abs(o.tcs)),
    tds: sum((o) => Math.abs(o.tds)),
    reverse_logistic: sum((o) => Math.abs(o.return_fee)),
    cancellation_fee: sum((o) => Math.abs(o.cancellation_fee)),
  }
}

export async function ensureCommissionInvoiceSnapshotTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_commission_invoice_monthly (
      id text PRIMARY KEY,
      vendor_id text NOT NULL,
      period_key text NOT NULL,
      invoice_number text NOT NULL,
      payload jsonb NOT NULL,
      generated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (vendor_id, period_key)
    )
  `)
}

export async function saveMonthlyCommissionInvoice(
  pool: Pool,
  vendorId: string,
  periodKey: string,
  payload: CommissionInvoicePayload
) {
  await ensureCommissionInvoiceSnapshotTable(pool)
  const id = `cinv_${vendorId.slice(-10)}_${periodKey.replace(/-/g, "")}`
  await pool.query(
    `
      INSERT INTO vendor_commission_invoice_monthly
        (id, vendor_id, period_key, invoice_number, payload, generated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (vendor_id, period_key)
      DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        payload = EXCLUDED.payload,
        generated_at = NOW()
    `,
    [id, vendorId, periodKey, payload.invoice_number, JSON.stringify(payload)]
  )
  return id
}

export async function loadMonthlyCommissionInvoice(
  pool: Pool,
  vendorId: string,
  periodKey: string
): Promise<CommissionInvoicePayload | null> {
  await ensureCommissionInvoiceSnapshotTable(pool)
  const { rows } = await pool.query<{ payload: CommissionInvoicePayload }>(
    `
      SELECT payload
      FROM vendor_commission_invoice_monthly
      WHERE vendor_id = $1 AND period_key = $2
      LIMIT 1
    `,
    [vendorId, periodKey]
  )
  return rows[0]?.payload || null
}

export async function buildVendorCommissionInvoice(
  vendorId: string,
  vendor: Record<string, unknown>,
  pool: Pool,
  range: CommissionInvoiceRange,
  fromRaw?: string,
  toRaw?: string,
  opts?: {
    preferSnapshot?: boolean
    markAutoGenerated?: boolean
    month?: string | number
    year?: string | number
  }
): Promise<CommissionInvoicePayload | { error: string }> {
  const window = resolveCommissionInvoiceWindow(
    range,
    fromRaw,
    toRaw,
    opts?.month != null ? String(opts.month) : undefined,
    opts?.year != null ? String(opts.year) : undefined
  )
  if (window.error) return { error: window.error }

  if (
    opts?.preferSnapshot &&
    window.periodKey &&
    (range === "last_month" || range === "month")
  ) {
    const snapshot = await loadMonthlyCommissionInvoice(pool, vendorId, window.periodKey)
    if (snapshot) return { ...snapshot, auto_generated: true }
  }

  const params: unknown[] = [vendorId]
  let dateFilter = ""
  if (window.from && window.to) {
    params.push(window.from.toISOString(), window.to.toISOString())
    dateFilter = `AND vel.delivered_at >= $2::timestamptz AND vel.delivered_at <= $3::timestamptz`
  }

  const { rows } = await pool.query<{
    order_id: string
    order_display_id: string | number | null
    status: string
    gross_amount: string | number
    taxable_amount: string | number
    gst_rate: string | number
    gst_amount: string | number
    listing_gst: string | number
    listing_total: string | number
    commission_rate: string | number
    commission_amount: string | number
    commission_gst: string | number
    logistic_fee: string | number
    logistic_gst: string | number
    platform_fee: string | number
    platform_gst: string | number
    partner_commission: string | number
    partner_gst: string | number
    tcs_amount: string | number
    tds_amount: string | number
    return_fee: string | number
    cancellation_fee: string | number
    delivered_at: string | null
    product_name: string | null
  }>(
    `
      SELECT
        vel.order_id,
        vel.order_display_id,
        vel.status,
        COALESCE(vel.gross_amount, 0) AS gross_amount,
        COALESCE(vel.taxable_amount, 0) AS taxable_amount,
        COALESCE(vel.gst_rate, 0) AS gst_rate,
        COALESCE(vel.gst_amount, 0) AS gst_amount,
        COALESCE(vel.listing_gst, vel.gst_amount, 0) AS listing_gst,
        COALESCE(vel.listing_total, 0) AS listing_total,
        COALESCE(vel.commission_rate, 0) AS commission_rate,
        COALESCE(vel.commission_amount, 0) AS commission_amount,
        COALESCE(vel.commission_gst, 0) AS commission_gst,
        COALESCE(vel.logistic_fee, 0) AS logistic_fee,
        COALESCE(vel.logistic_gst, 0) AS logistic_gst,
        COALESCE(vel.platform_fee, 0) AS platform_fee,
        COALESCE(vel.platform_gst, 0) AS platform_gst,
        COALESCE(vel.partner_commission, 0) AS partner_commission,
        COALESCE(vel.partner_gst, 0) AS partner_gst,
        COALESCE(vel.tcs_amount, 0) AS tcs_amount,
        COALESCE(vel.tds_amount, 0) AS tds_amount,
        COALESCE(vel.return_fee, 0) AS return_fee,
        COALESCE(vel.cancellation_fee, 0) AS cancellation_fee,
        vel.delivered_at,
        (
          SELECT COALESCE(oli.title, 'Product')
          FROM order_item oi
          JOIN order_line_item oli ON oi.item_id = oli.id
          LEFT JOIN product_variant pv ON oli.variant_id = pv.id
          LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
          WHERE oi.order_id = vel.order_id
            AND p.metadata->>'vendor_id' = $1
          ORDER BY oli.id
          LIMIT 1
        ) AS product_name
      FROM vendor_earnings_log vel
      WHERE vel.vendor_id = $1
        AND vel.delivered_at IS NOT NULL
        AND vel.status NOT IN ('ON_HOLD')
        AND vel.order_id NOT LIKE 'claim:%'
        ${dateFilter}
      ORDER BY vel.delivered_at DESC, vel.updated_at DESC
    `,
    params
  )

  const orders: CommissionInvoiceOrderLine[] = rows.map((row) => {
    const saleAmount = round2(Number(row.gross_amount) || 0)
    const returnFee = round2(Number(row.return_fee) || 0)
    const cancellationFee = round2(Number(row.cancellation_fee) || 0)
    const status = String(row.status || "")
    const sign = status.toUpperCase() === "REVERSED" ? -1 : 1
    const productGst = round2(Number(row.listing_gst) || Number(row.gst_amount) || 0) * sign
    const category = classifyOrder({
      status,
      cancellation_fee: cancellationFee,
      return_fee: returnFee,
      sale_amount: saleAmount * sign,
    })

    return {
      order_id: row.order_id,
      order_display_id: row.order_display_id,
      product_name: row.product_name?.trim() || "Product",
      delivered_at: row.delivered_at,
      category,
      status,
      sale_amount: round2(saleAmount * sign),
      taxable_amount: round2((Number(row.taxable_amount) || 0) * sign),
      product_gst_rate: round2(Number(row.gst_rate) || 0),
      product_gst: productGst,
      listing_total: round2((Number(row.listing_total) || 0) * sign),
      logistic_fee: round2((Number(row.logistic_fee) || 0) * sign),
      logistic_gst: round2((Number(row.logistic_gst) || 0) * sign),
      platform_fee: round2((Number(row.platform_fee) || 0) * (sign < 0 ? -1 : 1)),
      platform_gst: round2((Number(row.platform_gst) || 0) * (sign < 0 ? -1 : 1)),
      commission_rate: round2(Number(row.commission_rate) || 0),
      commission_amount: round2((Number(row.commission_amount) || 0) * (sign < 0 ? -1 : 1)),
      commission_gst: round2((Number(row.commission_gst) || 0) * (sign < 0 ? -1 : 1)),
      partner_commission: round2((Number(row.partner_commission) || 0) * (sign < 0 ? -1 : 1)),
      partner_gst: round2((Number(row.partner_gst) || 0) * (sign < 0 ? -1 : 1)),
      tcs: round2((Number(row.tcs_amount) || 0) * (sign < 0 ? -1 : 1)),
      tds: round2((Number(row.tds_amount) || 0) * (sign < 0 ? -1 : 1)),
      return_fee: returnFee,
      reverse_logistic_gst: round2(returnFee * 0.18),
      cancellation_fee: cancellationFee,
      invoice_date: row.delivered_at,
    }
  })

  const serviceLines = buildServiceLinesFromOrders(orders)
  const feeSummary = buildFeeSummary(orders)
  const totals = serviceLines.reduce(
    (acc, line) => ({
      net_taxable: round2(acc.net_taxable + line.net_taxable),
      gst_amount: round2(acc.gst_amount + line.gst_amount),
      grand_total: round2(acc.grand_total + line.total),
    }),
    { net_taxable: 0, gst_amount: 0, grand_total: 0 }
  )

  const stamp = istDayKey(window.to || new Date())
  const invoiceNumber = window.periodKey
    ? `CI-${String(vendorId).slice(-8).toUpperCase()}-${window.periodKey.replace(/-/g, "")}`
    : `CI-${String(vendorId).slice(-8).toUpperCase()}-${stamp.replace(/-/g, "")}`

  return {
    invoice_title: "Commission/Tax Invoice",
    invoice_number: invoiceNumber,
    invoice_date: stamp,
    period_label: window.label,
    period_from: window.from ? window.from.toISOString() : null,
    period_to: window.to ? window.to.toISOString() : null,
    period_key: window.periodKey,
    auto_generated: Boolean(opts?.markAutoGenerated),
    billed_from: getCommissionInvoicePlatform(),
    billed_to: {
      display_name: String(vendor.store_name || vendor.name || "Vendor"),
      business_name: String(vendor.store_name || vendor.name || "Vendor"),
      address: buildVendorAddress(vendor),
      place_of_supply: stateSupplyLabel(vendor.store_region, vendor.store_country),
      phone: String(vendor.store_phone || vendor.phone || ""),
      email: String(vendor.email || ""),
      gstin: vendor.gst_no ? String(vendor.gst_no) : null,
      pan: vendor.pan_no ? String(vendor.pan_no) : null,
    },
    orders,
    service_lines: serviceLines,
    fee_summary: feeSummary,
    totals,
  }
}
