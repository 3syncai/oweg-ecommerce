export type CommissionInvoiceOrderLine = {
  order_id: string
  order_display_id: string | number | null
  product_name: string
  delivered_at: string | null
  category?: "sale" | "return" | "cancellation"
  status?: string
  sale_amount: number
  taxable_amount?: number
  product_gst_rate?: number
  product_gst?: number
  listing_total?: number
  logistic_fee: number
  logistic_gst?: number
  platform_fee?: number
  platform_gst?: number
  commission_rate: number
  commission_amount: number
  commission_gst?: number
  partner_commission?: number
  partner_gst?: number
  tcs?: number
  tds?: number
  return_fee?: number
  reverse_logistic_gst?: number
  cancellation_fee?: number
  invoice_date?: string | null
}

export type CommissionInvoiceData = {
  invoice_title: string
  invoice_number: string
  invoice_date: string
  period_label: string
  period_key?: string | null
  auto_generated?: boolean
  billed_from: {
    name: string
    address: string
    phone: string
    email: string
    gstin: string
    pan: string
  }
  billed_to: {
    display_name: string
    business_name: string
    address: string
    place_of_supply: string
    phone: string
    email: string
    gstin: string | null
    pan: string | null
  }
  orders: CommissionInvoiceOrderLine[]
  service_lines: Array<{
    sac: string
    description: string
    net_taxable: number
    gst_rate: number
    gst_amount: number
    total: number
  }>
  fee_summary?: {
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
  totals: {
    net_taxable: number
    gst_amount: number
    grand_total: number
  }
}

export type CommissionInvoiceExportOpts = {
  orderDisplayId?: string | number | null
  orderId?: string
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
const SERVICE_GST = 18

function serviceLine(
  sac: string,
  description: string,
  netTaxable: number,
  gstRate = SERVICE_GST
) {
  const net = round2(Math.max(0, netTaxable))
  const gst = round2((net * gstRate) / 100)
  return {
    sac,
    description,
    net_taxable: net,
    gst_rate: gstRate,
    gst_amount: gst,
    total: round2(net + gst),
  }
}

export function buildServiceLinesFromOrders(orders: CommissionInvoiceOrderLine[]) {
  const sum = (pick: (o: CommissionInvoiceOrderLine) => number) =>
    round2(orders.reduce((acc, row) => acc + Math.abs(pick(row) || 0), 0))

  const lines = []
  const commission = sum((o) => o.commission_amount)
  const platform = sum((o) => o.platform_fee || 0)
  const partner = sum((o) => o.partner_commission || 0)
  const logistics = sum((o) => o.logistic_fee)
  const reverse = sum((o) => o.return_fee || 0)
  const cancel = sum((o) => o.cancellation_fee || 0)

  if (commission > 0) lines.push(serviceLine("998599", "Commission Fee", commission))
  if (platform > 0) lines.push(serviceLine("998599", "Platform Fee", platform))
  if (partner > 0) lines.push(serviceLine("998599", "Partner Commission", partner))
  if (logistics > 0) lines.push(serviceLine("996812", "Logistics / Shipping Fee", logistics))
  if (reverse > 0) lines.push(serviceLine("996812", "Reverse Logistics Fee", reverse))
  if (cancel > 0) lines.push(serviceLine("998599", "Cancellation Fee", cancel))
  return lines
}

export function buildFeeSummary(orders: CommissionInvoiceOrderLine[]) {
  const sum = (pick: (o: CommissionInvoiceOrderLine) => number) =>
    round2(orders.reduce((acc, row) => acc + (pick(row) || 0), 0))
  return {
    sale_amount: sum((o) => o.sale_amount),
    product_gst: sum((o) => o.product_gst || 0),
    logistic_fee: sum((o) => Math.abs(o.logistic_fee || 0)),
    platform_fee: sum((o) => Math.abs(o.platform_fee || 0)),
    platform_gst: sum((o) => Math.abs(o.platform_gst || 0)),
    commission: sum((o) => Math.abs(o.commission_amount || 0)),
    commission_gst: sum((o) => Math.abs(o.commission_gst || 0)),
    partner: sum((o) => Math.abs(o.partner_commission || 0)),
    partner_gst: sum((o) => Math.abs(o.partner_gst || 0)),
    tcs: sum((o) => Math.abs(o.tcs || 0)),
    tds: sum((o) => Math.abs(o.tds || 0)),
    reverse_logistic: sum((o) => Math.abs(o.return_fee || 0)),
    cancellation_fee: sum((o) => Math.abs(o.cancellation_fee || 0)),
  }
}

export function prepareCommissionInvoiceExport(
  data: CommissionInvoiceData,
  opts?: CommissionInvoiceExportOpts
): { exportData: CommissionInvoiceData; fileSuffix: string } {
  const filteredOrders = opts?.orderId
    ? data.orders.filter((o) => o.order_id === opts.orderId)
    : opts?.orderDisplayId != null
      ? data.orders.filter((o) => String(o.order_display_id) === String(opts.orderDisplayId))
      : data.orders

  const serviceLines = buildServiceLinesFromOrders(filteredOrders)
  const feeSummary = buildFeeSummary(filteredOrders)
  const totals = serviceLines.reduce(
    (acc, line) => ({
      net_taxable: round2(acc.net_taxable + line.net_taxable),
      gst_amount: round2(acc.gst_amount + line.gst_amount),
      grand_total: round2(acc.grand_total + line.total),
    }),
    { net_taxable: 0, gst_amount: 0, grand_total: 0 }
  )

  const fileSuffix =
    opts?.orderDisplayId != null
      ? `-Order-${String(opts.orderDisplayId).replace(/[^a-zA-Z0-9-]/g, "")}`
      : ""

  const exportData: CommissionInvoiceData = {
    ...data,
    period_label:
      opts?.orderDisplayId != null ? `Order #${opts.orderDisplayId}` : data.period_label,
    orders: filteredOrders,
    service_lines: serviceLines.length ? serviceLines : data.service_lines,
    fee_summary: feeSummary,
    totals: serviceLines.length ? totals : data.totals,
  }

  return { exportData, fileSuffix }
}

export const formatInvoiceDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    })
  } catch {
    return "—"
  }
}

export const formatInvoiceMoney = (amount: number) => {
  const n = Number(amount) || 0
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
