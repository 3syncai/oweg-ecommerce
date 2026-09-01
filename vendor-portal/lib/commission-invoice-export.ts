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
  rows.push([])
  rows.push([
    "Service Accounting Codes",
    "Description",
    "Net Taxable Value (Rs.)",
    "GST Rate (%)",
    "Amount (Rs.)",
    "Total (Rs.)",
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
    rows.push(["—", "No commission or shipping fees in this period", 0, 0, 0, 0])
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
    "Product",
    "Sale Amount (Rs.)",
    "Commission Rate (%)",
    "Commission (Rs.)",
    "Shipping Fee (Rs.)",
  ])

  for (const order of exportData.orders) {
    rows.push([
      formatInvoiceDate(order.delivered_at),
      order.order_display_id ? `#${order.order_display_id}` : "—",
      order.product_name,
      order.sale_amount,
      order.commission_rate,
      order.commission_amount,
      order.logistic_fee,
    ])
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Commission Invoice")
  XLSX.writeFile(
    workbook,
    `Commission-Invoice-${exportData.invoice_number.replace(/[^a-zA-Z0-9-]/g, "")}${fileSuffix}.xlsx`
  )
}
