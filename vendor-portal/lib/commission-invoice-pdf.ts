import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  type CommissionInvoiceData,
  type CommissionInvoiceExportOpts,
  formatInvoiceDate,
  prepareCommissionInvoiceExport,
} from "./commission-invoice-data"
import { OWEG_BRAND } from "./brand"

const TABLE_HEADER: [number, number, number] = [68, 114, 196]
const OWEG_GREEN: [number, number, number] = [0, 210, 106]
const MUTED: [number, number, number] = [100, 116, 139]
const INK: [number, number, number] = [15, 23, 42]
const RETURN_RED: [number, number, number] = [185, 28, 28]
const CANCEL_ORANGE: [number, number, number] = [194, 65, 12]

let logoCache: string | null = null

async function loadOwegLogoDataUrl(): Promise<string | null> {
  if (logoCache) return logoCache
  try {
    const res = await fetch("/oweg_logo.png")
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    logoCache = dataUrl
    return dataUrl
  } catch {
    return null
  }
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[]
}

function drawSectionBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  lines: string[]
) {
  const padding = 8
  const lineHeight = 4.2
  const body = lines.flatMap((line) => wrapText(doc, line, w - padding * 2))
  const h = 14 + body.length * lineHeight

  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, w, h, 2, 2, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(title.toUpperCase(), x + padding, y + 9)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  body.forEach((line, i) => {
    doc.text(line, x + padding, y + 16 + i * lineHeight)
  })

  return h
}

/** jsPDF Helvetica cannot draw ₹ — use ASCII-safe Rs. for PDF only. */
function money(n: number | undefined) {
  const value = Number(n) || 0
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  return value < 0 ? `-Rs. ${formatted}` : `Rs. ${formatted}`
}

export async function downloadCommissionInvoicePdf(
  data: CommissionInvoiceData,
  opts?: CommissionInvoiceExportOpts
) {
  const { exportData, fileSuffix } = prepareCommissionInvoiceExport(data, opts)
  const logo = await loadOwegLogoDataUrl()

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 10
  let y = 0

  doc.setFillColor(10, 10, 10)
  doc.rect(0, 0, pageW, 24, "F")
  doc.setFillColor(...OWEG_GREEN)
  doc.rect(0, 24, pageW, 1.2, "F")

  if (logo) {
    doc.addImage(logo, "PNG", margin, 5, 36, 14)
  } else {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.setTextColor(...OWEG_GREEN)
    doc.text("OWEG", margin, 14)
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(exportData.invoice_title, pageW - margin, 12, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  doc.text(
    exportData.auto_generated
      ? "Auto-generated monthly tax invoice · Marketplace services"
      : "Tax Invoice · Marketplace Services",
    pageW - margin,
    18,
    { align: "right" }
  )

  y = 30

  const metaW = (pageW - margin * 2 - 8) / 3
  ;[
    { label: "Invoice No.", value: exportData.invoice_number },
    { label: "Invoice Date", value: exportData.invoice_date },
    { label: "Period", value: exportData.period_label },
  ].forEach((item, i) => {
    const x = margin + i * (metaW + 4)
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, metaW, 14, 2, 2, "FD")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(item.label.toUpperCase(), x + 4, y + 5)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    doc.text(wrapText(doc, item.value, metaW - 8)[0] || "—", x + 4, y + 11)
  })

  y += 18

  const colW = (pageW - margin * 2 - 6) / 2
  const fromLines = [
    exportData.billed_from.name,
    exportData.billed_from.address,
    `Mobile: ${exportData.billed_from.phone}`,
    `Email: ${exportData.billed_from.email}`,
    `GSTIN: ${exportData.billed_from.gstin}`,
    `PAN: ${exportData.billed_from.pan}`,
  ]
  const toLines = [
    exportData.billed_to.display_name,
    exportData.billed_to.business_name,
    exportData.billed_to.address,
    `Place of Supply: ${exportData.billed_to.place_of_supply}`,
    `Mobile: ${exportData.billed_to.phone || "—"}`,
    `Email: ${exportData.billed_to.email || "—"}`,
    `GSTIN: ${exportData.billed_to.gstin || "—"}`,
    `PAN: ${exportData.billed_to.pan || "—"}`,
  ]

  const fromH = drawSectionBox(doc, margin, y, colW, "Billed From", fromLines)
  const toH = drawSectionBox(doc, margin + colW + 6, y, colW, "Billed To", toLines)
  y += Math.max(fromH, toH) + 6

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text("Service / Tax Details", margin, y)
  y += 3

  const serviceBody =
    exportData.service_lines.length > 0
      ? exportData.service_lines.map((line) => [
          line.sac,
          line.description,
          money(line.net_taxable),
          `${line.gst_rate}%`,
          money(line.gst_amount),
          money(line.total),
        ])
      : [["—", "No taxable fees in this period", "—", "—", "—", "—"]]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["SAC", "Description", "Net Taxable", "GST %", "GST Amount", "Total"]],
    body: serviceBody,
    foot: [
      [
        "Total",
        "",
        money(exportData.totals.net_taxable),
        "",
        money(exportData.totals.gst_amount),
        money(exportData.totals.grand_total),
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: TABLE_HEADER,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    footStyles: {
      fillColor: [219, 234, 254],
      textColor: INK,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: INK },
    columnStyles: {
      0: { cellWidth: 18 },
      2: { halign: "right" },
      3: { halign: "center", cellWidth: 14 },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    styles: { lineColor: [226, 232, 240], lineWidth: 0.2, cellPadding: 2.2 },
  })

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  y += 8

  if (exportData.orders.length > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text("Order-wise breakdown (all taxes & fees)", margin, y)
    y += 3

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [
        [
          "Order",
          "Date",
          "Type",
          "Product",
          "Sale",
          "Prod GST",
          "Rate",
          "Logistics",
          "Platform",
          "Commission",
          "Partner",
          "TCS",
          "TDS",
          "Reverse",
          "Cancel",
        ],
      ],
      body: exportData.orders.map((order) => [
        order.order_display_id ? `#${order.order_display_id}` : "—",
        formatInvoiceDate(order.delivered_at),
        order.category === "return"
          ? "Return"
          : order.category === "cancellation"
            ? "Cancel"
            : "Sale",
        order.product_name,
        money(order.sale_amount),
        money(order.product_gst),
        `${Number(order.product_gst_rate || 0)}%`,
        money(order.logistic_fee),
        money(order.platform_fee),
        money(order.commission_amount),
        money(order.partner_commission),
        money(order.tcs),
        money(order.tds),
        money(order.return_fee),
        money(order.cancellation_fee),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: OWEG_GREEN,
        textColor: [10, 10, 10],
        fontStyle: "bold",
        fontSize: 6.5,
      },
      bodyStyles: { fontSize: 6.5, textColor: INK },
      columnStyles: {
        0: { cellWidth: 14, fontStyle: "bold" },
        2: { cellWidth: 14 },
        3: { cellWidth: 28 },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "center", cellWidth: 10 },
        7: { halign: "right" },
        8: { halign: "right" },
        9: { halign: "right" },
        10: { halign: "right" },
        11: { halign: "right" },
        12: { halign: "right" },
        13: { halign: "right" },
        14: { halign: "right" },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return
        const order = exportData.orders[hookData.row.index]
        if (!order) return
        if (order.category === "return") {
          hookData.cell.styles.textColor = RETURN_RED
        } else if (order.category === "cancellation") {
          hookData.cell.styles.textColor = CANCEL_ORANGE
        }
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.15, cellPadding: 1.4 },
    })
  }

  const pageH = doc.internal.pageSize.getHeight()
  doc.setFillColor(...OWEG_GREEN)
  doc.rect(0, pageH - 10, pageW, 1, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(
    `Generated via OWEG Vendor Portal · ${OWEG_BRAND.primary} · Product GST uses vendor-set rate. Fees include service GST where applicable.`,
    pageW / 2,
    pageH - 5,
    { align: "center" }
  )

  const safeNumber = exportData.invoice_number.replace(/[^a-zA-Z0-9-]/g, "")
  doc.save(`Commission-Invoice-${safeNumber}${fileSuffix}.pdf`)
}

export type { CommissionInvoiceData, CommissionInvoiceExportOpts }
