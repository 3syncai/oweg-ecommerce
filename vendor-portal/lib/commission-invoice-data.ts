export type CommissionInvoiceData = {
  invoice_title: string
  invoice_number: string
  invoice_date: string
  period_label: string
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
  orders: Array<{
    order_id: string
    order_display_id: string | number | null
    product_name: string
    delivered_at: string | null
    sale_amount: number
    commission_rate: number
    commission_amount: number
    logistic_fee: number
  }>
  service_lines: Array<{
    sac: string
    description: string
    net_taxable: number
    gst_rate: number
    gst_amount: number
    total: number
  }>
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

const round2 = (n: number) => Math.round(n * 100) / 100

export function prepareCommissionInvoiceExport(
  data: CommissionInvoiceData,
  opts?: CommissionInvoiceExportOpts
): { exportData: CommissionInvoiceData; fileSuffix: string } {
  const filteredOrders = opts?.orderId
    ? data.orders.filter((o) => o.order_id === opts.orderId)
    : opts?.orderDisplayId != null
      ? data.orders.filter((o) => String(o.order_display_id) === String(opts.orderDisplayId))
      : data.orders

  const commissionTaxable = round2(filteredOrders.reduce((s, o) => s + o.commission_amount, 0))
  const shippingTaxable = round2(filteredOrders.reduce((s, o) => s + o.logistic_fee, 0))

  const serviceLines: CommissionInvoiceData["service_lines"] = []
  if (commissionTaxable > 0) {
    const gst = round2((commissionTaxable * 18) / 100)
    serviceLines.push({
      sac: "998599",
      description: "Commission Fee",
      net_taxable: commissionTaxable,
      gst_rate: 18,
      gst_amount: gst,
      total: round2(commissionTaxable + gst),
    })
  }
  if (shippingTaxable > 0) {
    const gst = round2((shippingTaxable * 18) / 100)
    serviceLines.push({
      sac: "996812",
      description: "Shipping Fee",
      net_taxable: shippingTaxable,
      gst_rate: 18,
      gst_amount: gst,
      total: round2(shippingTaxable + gst),
    })
  }

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
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `Rs. ${formatted}`
}
