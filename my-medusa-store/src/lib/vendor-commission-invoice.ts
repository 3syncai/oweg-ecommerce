import type { Pool } from "pg"

const SERVICE_GST_RATE = 18

const round2 = (n: number) => Math.round(n * 100) / 100

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
  sale_amount: number
  commission_rate: number
  commission_amount: number
  logistic_fee: number
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

export type CommissionInvoicePayload = {
  invoice_title: string
  invoice_number: string
  invoice_date: string
  period_label: string
  period_from: string | null
  period_to: string | null
  billed_from: CommissionInvoicePlatform
  billed_to: CommissionInvoiceVendor
  orders: CommissionInvoiceOrderLine[]
  service_lines: CommissionInvoiceServiceLine[]
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
  netTaxable: number
): CommissionInvoiceServiceLine {
  const net = round2(Math.max(0, netTaxable))
  const gstAmount = round2((net * SERVICE_GST_RATE) / 100)
  return {
    sac,
    description,
    net_taxable: net,
    gst_rate: SERVICE_GST_RATE,
    gst_amount: gstAmount,
    total: round2(net + gstAmount),
  }
}

export type CommissionInvoiceRange =
  | "today"
  | "1m"
  | "custom"
  | "all"

export function resolveCommissionInvoiceWindow(
  range: CommissionInvoiceRange,
  fromRaw?: string,
  toRaw?: string
): { from: Date | null; to: Date | null; label: string; error?: string } {
  const now = new Date()
  const endIst = (d: Date) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
    return new Date(`${key}T23:59:59.999+05:30`)
  }
  const startIst = (d: Date) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
    return new Date(`${key}T00:00:00+05:30`)
  }

  if (range === "all") {
    return { from: null, to: null, label: "All time" }
  }

  const to = endIst(now)

  if (range === "today") {
    return { from: startIst(now), to, label: "Today" }
  }

  if (range === "1m") {
    const from = startIst(now)
    from.setMonth(from.getMonth() - 1)
    return { from, to, label: "Last 1 month" }
  }

  if (!fromRaw || !toRaw) {
    return { from: null, to: null, label: "Custom", error: "from and to dates are required" }
  }

  const from = new Date(`${fromRaw}T00:00:00+05:30`)
  const customTo = new Date(`${toRaw}T23:59:59.999+05:30`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(customTo.getTime())) {
    return { from: null, to: null, label: "Custom", error: "Invalid date range" }
  }
  if (from.getTime() > customTo.getTime()) {
    return { from: null, to: null, label: "Custom", error: "From date must be before To date" }
  }

  return {
    from,
    to: customTo,
    label: `${fromRaw} to ${toRaw}`,
  }
}

export async function buildVendorCommissionInvoice(
  vendorId: string,
  vendor: Record<string, unknown>,
  pool: Pool,
  range: CommissionInvoiceRange,
  fromRaw?: string,
  toRaw?: string
): Promise<CommissionInvoicePayload | { error: string }> {
  const window = resolveCommissionInvoiceWindow(range, fromRaw, toRaw)
  if (window.error) return { error: window.error }

  const params: unknown[] = [vendorId]
  let dateFilter = ""
  if (window.from && window.to) {
    params.push(window.from.toISOString(), window.to.toISOString())
    dateFilter = `AND vel.delivered_at >= $2::timestamptz AND vel.delivered_at <= $3::timestamptz`
  }

  const { rows } = await pool.query<{
    order_id: string
    order_display_id: string | number | null
    gross_amount: string | number
    commission_rate: string | number
    commission_amount: string | number
    logistic_fee: string | number
    delivered_at: string | null
    product_name: string | null
  }>(
    `
      SELECT
        vel.order_id,
        vel.order_display_id,
        vel.gross_amount,
        vel.commission_rate,
        vel.commission_amount,
        COALESCE(vel.logistic_fee, 0) AS logistic_fee,
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
        AND vel.status NOT IN ('REVERSED', 'ON_HOLD')
        AND vel.order_id NOT LIKE 'claim:%'
        ${dateFilter}
      ORDER BY vel.delivered_at DESC, vel.updated_at DESC
    `,
    params
  )

  const orders: CommissionInvoiceOrderLine[] = rows.map((row) => ({
    order_id: row.order_id,
    order_display_id: row.order_display_id,
    product_name: row.product_name?.trim() || "Product",
    delivered_at: row.delivered_at,
    sale_amount: round2(Number(row.gross_amount) || 0),
    commission_rate: round2(Number(row.commission_rate) || 0),
    commission_amount: round2(Number(row.commission_amount) || 0),
    logistic_fee: round2(Number(row.logistic_fee) || 0),
    invoice_date: row.delivered_at,
  }))

  const commissionTaxable = round2(
    orders.reduce((sum, row) => sum + row.commission_amount, 0)
  )
  const shippingTaxable = round2(orders.reduce((sum, row) => sum + row.logistic_fee, 0))

  const serviceLines: CommissionInvoiceServiceLine[] = []
  if (commissionTaxable > 0) {
    serviceLines.push(serviceLine("998599", "Commission Fee", commissionTaxable))
  }
  if (shippingTaxable > 0) {
    serviceLines.push(serviceLine("996812", "Shipping Fee", shippingTaxable))
  }

  const totals = serviceLines.reduce(
    (acc, line) => ({
      net_taxable: round2(acc.net_taxable + line.net_taxable),
      gst_amount: round2(acc.gst_amount + line.gst_amount),
      grand_total: round2(acc.grand_total + line.total),
    }),
    { net_taxable: 0, gst_amount: 0, grand_total: 0 }
  )

  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(window.to || new Date())

  const invoiceNumber = `CI-${String(vendorId).slice(-8).toUpperCase()}-${stamp.replace(/-/g, "")}`

  return {
    invoice_title: "Commission/Tax Invoice",
    invoice_number: invoiceNumber,
    invoice_date: stamp,
    period_label: window.label,
    period_from: window.from ? window.from.toISOString() : null,
    period_to: window.to ? window.to.toISOString() : null,
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
    totals,
  }
}
