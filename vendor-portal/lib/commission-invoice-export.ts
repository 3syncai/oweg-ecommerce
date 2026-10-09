import * as XLSX from "xlsx"
import {
  type CommissionInvoiceData,
  type CommissionInvoiceExportOpts,
  formatInvoiceDate,
  prepareCommissionInvoiceExport,
} from "./commission-invoice-data"

export type { CommissionInvoiceData, CommissionInvoiceExportOpts }

export function downloadCommissionInvoiceExcel(
  data: CommissionInvoiceData,
  opts?: CommissionInvoiceExportOpts
) {
  const { exportData, fileSuffix } = prepareCommissionInvoiceExport(data, opts)

  const rows: (string | number)[][] = []

  rows.push([exportData.invoice_title])
  rows.push([])
  rows.push(["Billed From", "", "", "Billed To"])
  rows.push([exportData.billed_from.name, "", "", exportData.billed_to.display_name])
  rows.push([exportData.billed_from.address, "", "", exportData.billed_to.business_name])
  rows.push(["", "", "", exportData.billed_to.address])
  rows.push([
    `Mobile No: ${exportData.billed_from.phone}`,
    "",
    "",
    `Place of Supply/State Code: ${exportData.billed_to.place_of_supply}`,
  ])
  rows.push([
    `Email ID: ${exportData.billed_from.email}`,
    "",
    "",
    `Mobile No: ${exportData.billed_to.phone || "—"}`,
  ])
  rows.push([
    `GSTIN: ${exportData.billed_from.gstin}`,
    "",
    "",
    `Email ID: ${exportData.billed_to.email || "—"}`,
  ])
  rows.push([
    `PAN: ${exportData.billed_from.pan}`,
    "",
    "",
    `GSTIN: ${exportData.billed_to.gstin || "—"}`,
  ])
  rows.push(["", "", "", `PAN: ${exportData.billed_to.pan || "—"}`])
  rows.push([])
  rows.push([
    "Invoice No",
    exportData.invoice_number,
    "Invoice Date",
    exportData.invoice_date,
    "Period",
    exportData.period_label,
  ])
  rows.push([
    "Sale (incl. GST)",
    exportData.fee_summary?.sale_amount || 0,
    "Product GST",
    exportData.fee_summary?.product_gst || 0,
  ])
  rows.push([])
  rows.push([
    "Service Accounting Codes",
    "Description",
    "Net Taxable Value (₹)",
    "GST Rate (%)",
    "Amount (₹)",
    "Total (₹)",
  ])

  for (const line of exportData.service_lines) {
    rows.push([
      line.sac,
      line.description,
      line.net_taxable,
      line.gst_rate,
      line.gst_amount,
      line.total,
    ])
  }

  if (!exportData.service_lines.length) {
    rows.push(["—", "No taxable fees in this period", 0, 0, 0, 0])
  }

  rows.push([
    "Total",
    "",
    exportData.totals.net_taxable,
    "",
    exportData.totals.gst_amount,
    exportData.totals.grand_total,
  ])

  rows.push([])
  rows.push(["Order-wise product summary"])
  rows.push([
    "Invoice Date",
    "Order ID",
    "Type",
    "Product",
    "Sale Amount (₹)",
    "Product GST (₹)",
    "GST Rate (%)",
    "Logistics (₹)",
    "Platform Fee (₹)",
    "Commission Rate (%)",
    "Commission (₹)",
    "Partner (₹)",
    "TCS (₹)",
    "TDS (₹)",
    "Reverse Logistics (₹)",
    "Cancellation (₹)",
  ])

  for (const order of exportData.orders) {
    rows.push([
      formatInvoiceDate(order.delivered_at),
      order.order_display_id ? `#${order.order_display_id}` : "—",
      order.category || "sale",
      order.product_name,
      order.sale_amount,
      order.product_gst || 0,
      order.product_gst_rate || 0,
      order.logistic_fee,
      order.platform_fee || 0,
      order.commission_rate,
      order.commission_amount,
      order.partner_commission || 0,
      order.tcs || 0,
      order.tds || 0,
      order.return_fee || 0,
      order.cancellation_fee || 0,
    ])
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!cols"] = Array.from({ length: 16 }, () => ({ wch: 16 }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Commission Invoice")
  const stamp = new Date().toISOString().slice(0, 10)
  const safeNumber = exportData.invoice_number.replace(/[^a-zA-Z0-9-]/g, "")
  XLSX.writeFile(workbook, `Commission-Invoice-${safeNumber}${fileSuffix}-${stamp}.xlsx`)
}
