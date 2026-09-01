import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  type CommissionInvoiceData,
  type CommissionInvoiceExportOpts,
  formatInvoiceDate,
  formatInvoiceMoney,
  prepareCommissionInvoiceExport,
} from "./commission-invoice-data"
import { OWEG_BRAND } from "./brand"

const TABLE_HEADER: [number, number, number] = [68, 114, 196]
const OWEG_GREEN: [number, number, number] = [0, 210, 106]
const MUTED: [number, number, number] = [100, 116, 139]
const INK: [number, number, number] = [15, 23, 42]

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

export async function downloadCommissionInvoicePdf(
  data: CommissionInvoiceData,
  opts?: CommissionInvoiceExportOpts
) {
  const { exportData, fileSuffix } = prepareCommissionInvoiceExport(data, opts)
  const logo = await loadOwegLogoDataUrl()

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 0

  // Header band
  doc.setFillColor(10, 10, 10)
  doc.rect(0, 0, pageW, 28, "F")
  doc.setFillColor(...OWEG_GREEN)
  doc.rect(0, 28, pageW, 1.2, "F")

  if (logo) {
    doc.addImage(logo, "PNG", margin, 6, 42, 16)
  } else {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.setTextColor(...OWEG_GREEN)
    doc.text("OWEG", margin, 16)
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text(exportData.invoice_title, pageW - margin, 14, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text("Tax Invoice · Marketplace Services", pageW - margin, 20, { align: "right" })

  y = 36

  // Meta row
  const metaW = (pageW - margin * 2 - 8) / 3
  const metaItems = [
    { label: "Invoice No.", value: exportData.invoice_number },
    { label: "Invoice Date", value: exportData.invoice_date },
    { label: "Period", value: exportData.period_label },
  ]
  metaItems.forEach((item, i) => {
    const x = margin + i * (metaW + 4)
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, metaW, 16, 2, 2, "FD")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(item.label.toUpperCase(), x + 5, y + 6)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...INK)
    const valLines = wrapText(doc, item.value, metaW - 10)
    doc.text(valLines[0] || "—", x + 5, y + 12)
  })

  y += 22

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
  y += Math.max(fromH, toH) + 8

  // Service lines table
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text("Service Details", margin, y)
  y += 4

  const serviceBody =
    exportData.service_lines.length > 0
      ? exportData.service_lines.map((line) => [
          line.sac,
          line.description,
          formatInvoiceMoney(line.net_taxable),
          `${line.gst_rate}%`,
          formatInvoiceMoney(line.gst_amount),
          formatInvoiceMoney(line.total),
        ])
      : [["—", "No commission or shipping fees in this period", "—", "—", "—", "—"]]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        "SAC",
        "Description",
        "Net Taxable",
        "GST %",
        "GST Amount",
        "Total",
      ],
    ],
    body: serviceBody,
    foot: [
      [
        "Total",
        "",
        formatInvoiceMoney(exportData.totals.net_taxable),
        "",
        formatInvoiceMoney(exportData.totals.gst_amount),
        formatInvoiceMoney(exportData.totals.grand_total),
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: TABLE_HEADER,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
    },
    footStyles: {
      fillColor: [219, 234, 254],
      textColor: INK,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: INK,
    },
    columnStyles: {
      0: { cellWidth: 18 },
      2: { halign: "right" },
      3: { halign: "center", cellWidth: 16 },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    styles: {
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      cellPadding: 3,
    },
  })

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  y += 10

  // Order summary
  if (exportData.orders.length > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text("Delivered Orders", margin, y)
    y += 4

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Order No.", "Delivered", "Product", "Sale", "Commission", "Shipping"]],
      body: exportData.orders.map((order) => [
        order.order_display_id ? `#${order.order_display_id}` : "—",
        formatInvoiceDate(order.delivered_at),
        order.product_name,
        formatInvoiceMoney(order.sale_amount),
        formatInvoiceMoney(order.commission_amount),
        formatInvoiceMoney(order.logistic_fee),
      ]),
      theme: "striped",
      headStyles: {
        fillColor: OWEG_GREEN,
        textColor: [10, 10, 10],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      bodyStyles: { fontSize: 8.5, textColor: INK },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      styles: {
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: 2.8,
      },
    })
  }

  const pageH = doc.internal.pageSize.getHeight()
  doc.setFillColor(...OWEG_GREEN)
  doc.rect(0, pageH - 12, pageW, 1, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    `Generated via OWEG Vendor Portal · ${OWEG_BRAND.primary} · This is a computer-generated invoice.`,
    pageW / 2,
    pageH - 6,
    { align: "center" }
  )

  const safeNumber = exportData.invoice_number.replace(/[^a-zA-Z0-9-]/g, "")
  doc.save(`Commission-Invoice-${safeNumber}${fileSuffix}.pdf`)
}

export type { CommissionInvoiceData, CommissionInvoiceExportOpts }
