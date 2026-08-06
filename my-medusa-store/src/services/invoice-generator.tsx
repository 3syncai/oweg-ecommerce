import React from "react"
import fs from "fs"
import path from "path"
import { getItemUnits, getItemUnitPrice } from "../lib/vendor-order-workflow"
import {
  allocateDiscountAcrossLines,
  breakdownInclusiveGst,
  parseGstRate,
  resolveOrderGstDiscountRupees,
  summarizeOrderGst,
  type OrderGstLine,
} from "../lib/gst-inclusive"

/** Helvetica has no ₹ glyph — use ASCII-safe "Rs." for PDF. */
const formatMoney = (amount: number) => {
  const n = Number(amount) || 0
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `Rs. ${formatted}`
}

const formatDate = (value?: string | Date | null) => {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-IN")
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function loadPngDataUri(candidates: string[]): string | null {
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const buf = fs.readFileSync(file)
        return `data:image/png;base64,${buf.toString("base64")}`
      }
    } catch {
      // try next
    }
  }
  return null
}

/** Wordmark only: vendor-portal/public/Oweg.png */
function loadOwegWordmarkDataUri(): string | null {
  return loadPngDataUri([
    path.join(process.cwd(), "assets", "Oweg.png"),
    path.join(process.cwd(), "my-medusa-store", "assets", "Oweg.png"),
    path.join(process.cwd(), "..", "vendor-portal", "public", "Oweg.png"),
    path.join(process.cwd(), "vendor-portal", "public", "Oweg.png"),
    path.join(__dirname, "../../assets/Oweg.png"),
    path.join(__dirname, "../../../vendor-portal/public/Oweg.png"),
  ])
}

type InvoiceSeller = {
  brand: string
  /** Sold By display name (vendor store / seller name) — not shown next to logo */
  name: string
  address: string
  gst: string
  pan: string | null
  phone: string | null
  email: string | null
  /** When false, Sold By omits phone/email (vendor invoices). */
  showContact: boolean
}

function formatVendorAddress(vendorLike: Record<string, any> | null | undefined): string {
  if (!vendorLike) return ""
  const parts = [
    vendorLike.store_address,
    [vendorLike.store_city, vendorLike.store_pincode].filter(Boolean).join(" - "),
    vendorLike.store_region,
    vendorLike.store_country,
  ]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
  return parts.join(", ")
}

function sellerProfile(order?: any): InvoiceSeller {
  const platform = {
    brand: process.env.INVOICE_SELLER_BRAND || "OWEG",
    name:
      process.env.INVOICE_SELLER_LEGAL || "Ascent Retechno India Private Limited",
    address:
      process.env.INVOICE_SELLER_ADDRESS ||
      "AV SIGNATURE RESIDENCY, NH-57 SHOP NO 001, A BLOCK, BASUDEVPUR DARBHANGA, BIHAR - 846005",
    gst: process.env.INVOICE_SELLER_GST || "10AAWCA5289L1Z3",
    pan: process.env.INVOICE_SELLER_PAN || null,
    phone: process.env.INVOICE_SELLER_PHONE || "+91 8956085313",
    email: process.env.INVOICE_SELLER_EMAIL || "darbhanga@oweg.in",
  }

  const override = (order?.invoice_seller || order?.seller || {}) as Record<string, any>
  const hasVendorOverride = Boolean(
    override.name || override.address || override.store_address || override.pan
  )

  const address =
    String(override.address || "").trim() ||
    formatVendorAddress(override) ||
    platform.address

  return {
    brand: String(override.brand || platform.brand),
    name: String(override.name || override.store_name || platform.name),
    address,
    gst: String(override.gst || override.gst_no || platform.gst),
    pan: override.pan || override.pan_no || platform.pan || null,
    phone: hasVendorOverride ? null : platform.phone,
    email: hasVendorOverride ? null : platform.email,
    showContact: hasVendorOverride
      ? false
      : override.show_contact !== false,
  }
}

function resolvePaymentMethod(order: any): string {
  const meta = order?.metadata || {}
  const raw = String(
    meta.payment_method || meta.payment_type || order.payment_type || ""
  ).toLowerCase()
  if (raw.includes("cod") || raw === "postpaid") return "Cash on Delivery (COD)"
  if (raw.includes("razor")) return "Pay by Razorpay"
  if (raw.includes("prepaid") || raw.includes("online")) return "Prepaid"
  return raw ? raw : "Prepaid"
}

function personName(address: any, fallback?: string | null): string {
  const fromAddr = `${address?.first_name || ""} ${address?.last_name || ""}`.trim()
  return fromAddr || String(fallback || "").trim() || "Customer"
}

function addressBodyLines(address: any): string[] {
  if (!address) return []
  return [
    address.company,
    address.address_1,
    address.address_2,
    [address.city, address.postal_code].filter(Boolean).join(", "),
    address.province,
    String(address.country_code || "IN").toUpperCase() === "IN"
      ? "India"
      : address.country_code,
  ].filter(Boolean) as string[]
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "Not Provided"
  const digits = String(raw).replace(/\D/g, "")
  if (!digits) return "Not Provided"
  if (digits.length === 10) return `+91 ${digits}`
  if (digits.length > 10 && digits.startsWith("91")) return `+${digits}`
  return String(raw).trim()
}

function shortSku(raw: string): string {
  const s = String(raw || "").trim()
  if (!s || s === "—") return "—"
  if (s.length <= 18) return s
  return `…${s.slice(-14)}`
}

function resolveShippingInclusive(order: any): number {
  const candidates = [
    order?.shipping_total,
    order?.shipping_amount,
    order?.shipping_fee,
    order?.summary?.shipping_total,
    order?.summary?.original_shipping_total,
    order?.metadata?.shipping_total,
    order?.metadata?.shipping_amount,
  ]
  for (const raw of candidates) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100
  }
  return 0
}

const DEFAULT_SHIPPING_GST_RATE = 18

export const generateInvoice = async (order: any) => {
  const { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } =
    await import("@react-pdf/renderer")

  const seller = sellerProfile(order)
  const logoWordmark = loadOwegWordmarkDataUri()
  const billTo = order.billing_address || order.shipping_address || {}
  const shipTo = order.shipping_address || order.billing_address || {}
  const items = Array.isArray(order.items) ? order.items : []

  const lineRows = items.map((item: any) => {
    const qty = getItemUnits(item)
    const unit = getItemUnitPrice(item)
    const skuRaw =
      item.variant_sku || item.variant?.sku || item.sku || item.product_id || "—"
    const itemMeta = item.metadata || {}
    const productMeta =
      item.product?.metadata || item.variant?.product?.metadata || {}
    // Merge so vendor product GST settings are available for rate resolution
    const metadata = {
      ...productMeta,
      ...itemMeta,
      gst_rate: itemMeta.gst_rate ?? productMeta.gst_rate,
      tax_code: itemMeta.tax_code ?? productMeta.tax_code,
    }
    return {
      id: item.id,
      title: String(item.title || "Item"),
      sku: shortSku(skuRaw),
      qty,
      unit,
      lineTotal: unit * qty,
      metadata,
    }
  })

  const subtotal =
    order.subtotal != null
      ? Number(order.subtotal)
      : lineRows.reduce((s: number, r: any) => s + r.lineTotal, 0)

  // Free shipping → show 0 (always include Shipping Charges row)
  const shippingInclusive = resolveShippingInclusive(order)

  const discountInfo = resolveOrderGstDiscountRupees(
    (order.metadata || {}) as Record<string, unknown>,
    order.discount_total ?? order.summary?.discount_total
  )
  const discountShares = allocateDiscountAcrossLines(
    lineRows.map((row: any) => Number(row.lineTotal) || 0),
    discountInfo.total
  )

  const productGstLines: OrderGstLine[] = lineRows.map((row: any, index: number) => {
    const meta = row.metadata || {}
    // Use vendor-set product GST only — never invent a default 18%
    const rate =
      parseGstRate(meta.gst_rate) ??
      parseGstRate(meta.tax_code) ??
      parseGstRate(meta.gst_breakdown?.rate) ??
      0
    const taxCode = meta.tax_code || meta.gst_breakdown?.tax_code || null
    const grossInclusive = Number(row.lineTotal) || 0
    const discount = discountShares[index] || 0
    const netInclusive = Math.max(0, grossInclusive - discount)
    const breakdown = breakdownInclusiveGst(netInclusive, rate, taxCode)

    return {
      item_id: row.id,
      title: row.title,
      quantity: row.qty,
      sku: row.sku,
      gross_inclusive: grossInclusive,
      discount,
      ...breakdown,
    }
  })

  const shippingBreakdown =
    shippingInclusive > 0
      ? breakdownInclusiveGst(shippingInclusive, DEFAULT_SHIPPING_GST_RATE, null)
      : {
          inclusive: 0,
          taxable: 0,
          gst: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          rate: DEFAULT_SHIPPING_GST_RATE,
          tax_code: null as string | null,
        }

  const productSummary = summarizeOrderGst(productGstLines, {
    discount: discountInfo.total,
  })

  const grandTaxable =
    Math.round(((productSummary?.taxable || 0) + shippingBreakdown.taxable) * 100) / 100
  const grandGst =
    Math.round(((productSummary?.gst || 0) + shippingBreakdown.gst) * 100) / 100
  const productInclusiveNet = Math.round(
    (subtotal - (discountInfo.total || 0)) * 100
  ) / 100
  const grandTotal =
    Math.round((productInclusiveNet + shippingInclusive) * 100) / 100

  const invoiceNo =
    order.invoice_number ||
    `INV-${order.display_id || String(order.id || "").slice(-8)}`
  const orderId = order.display_id || order.id
  const customerGst =
    order.customer_gstin ||
    order.customer?.gst_number ||
    order.metadata?.customer_gstin ||
    null
  const customerEmail = order.email || billTo.email || shipTo.email || null
  const billPhone = normalizePhone(billTo.phone || shipTo.phone || order.phone)
  const shipPhone = normalizePhone(shipTo.phone || billTo.phone || order.phone)
  const paymentMethod = resolvePaymentMethod(order)
  const placeOfSupply = shipTo.province || billTo.province || "India"

  // Columns aligned to PPT: Product | Sku | Qty | Taxable | Gst Rate | Gst Amt | Total
  const COL = {
    desc: 130,
    sku: 70,
    qty: 36,
    taxable: 72,
    rate: 52,
    gst: 68,
    total: 72,
  }

  const styles = StyleSheet.create({
    page: {
      flexDirection: "column",
      backgroundColor: "#FFFFFF",
      paddingTop: 24,
      paddingBottom: 40,
      paddingHorizontal: 24,
      fontFamily: "Helvetica",
      fontSize: 9,
      color: "#111111",
    },
    brandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
      borderBottomWidth: 1.5,
      borderBottomColor: "#1B7A4E",
      paddingBottom: 10,
    },
    brandLeft: { flexDirection: "row", alignItems: "center", maxWidth: 320 },
    logoWordmark: { width: 96, height: 28, marginRight: 10 },
    brandName: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: "#1B7A4E",
    },
    brandSub: { fontSize: 8, color: "#666666", marginTop: 2 },
    docTitle: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      textAlign: "right",
    },
    docMeta: { fontSize: 8, color: "#555555", textAlign: "right", marginTop: 2 },
    threeCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
      gap: 8,
    },
    col: { width: "32%" },
    sectionTitle: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      marginBottom: 4,
      color: "#1B7A4E",
    },
    line: { fontSize: 8, marginBottom: 2, color: "#222222" },
    muted: { fontSize: 8, color: "#666666", marginBottom: 2 },
    metaBox: {
      backgroundColor: "#F5F8F6",
      borderWidth: 1,
      borderColor: "#D7E5DC",
      padding: 8,
      marginBottom: 10,
    },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    metaItem: {
      width: "50%",
      marginBottom: 3,
    },
    table: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: "#D0D0D0",
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#1B7A4E",
      alignItems: "center",
      minHeight: 24,
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderTopWidth: 1,
      borderTopColor: "#E6E6E6",
      minHeight: 26,
    },
    cell: {
      paddingVertical: 5,
      paddingHorizontal: 3,
      justifyContent: "center",
    },
    thText: {
      color: "#FFFFFF",
      fontSize: 7,
      fontFamily: "Helvetica-Bold",
    },
    tdText: { fontSize: 7.5, color: "#222222" },
    left: { textAlign: "left" },
    right: { textAlign: "right" },
    center: { textAlign: "center" },
    totalsWrap: { marginTop: 10, alignItems: "flex-end" },
    totalsBox: {
      width: 230,
      borderWidth: 1,
      borderColor: "#D7E5DC",
      backgroundColor: "#F5F8F6",
      padding: 10,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    grandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: "#1B7A4E",
    },
    footer: {
      position: "absolute",
      bottom: 16,
      left: 24,
      right: 24,
      borderTopWidth: 1,
      borderTopColor: "#EEEEEE",
      paddingTop: 6,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerText: { fontSize: 7, color: "#888888" },
  })

  const textAlignStyle = (align: "left" | "center" | "right" = "left") => {
    if (align === "right") return styles.right
    if (align === "center") return styles.center
    return styles.left
  }

  const HeaderCell = ({
    width,
    children,
    align = "left",
  }: {
    width: number
    children: string
    align?: "left" | "center" | "right"
  }) => (
    <View style={[styles.cell, { width }]}>
      <Text style={[styles.thText, textAlignStyle(align)]}>{children}</Text>
    </View>
  )

  const DataCell = ({
    width,
    children,
    align = "left",
  }: {
    width: number
    children: string | number
    align?: "left" | "center" | "right"
  }) => (
    <View style={[styles.cell, { width }]}>
      <Text style={[styles.tdText, textAlignStyle(align)]}>{String(children)}</Text>
    </View>
  )

  const PartyBlock = ({
    title,
    name,
    address,
    gst,
    phone,
    email,
  }: {
    title: string
    name: string
    address: any
    gst: string
    phone: string
    email: string
  }) => (
    <View style={styles.col}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={{ ...styles.line, fontFamily: "Helvetica-Bold" }}>{name}</Text>
      {addressBodyLines(address).map((line, idx) => (
        <Text key={`${title}-${idx}`} style={styles.line}>
          {line}
        </Text>
      ))}
      <Text style={styles.line}>GST No: {gst}</Text>
      <Text style={styles.muted}>Mobile No.: {phone}</Text>
      <Text style={styles.muted}>Email Id.: {email}</Text>
    </View>
  )

  const InvoiceDocument = () => (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            {logoWordmark ? (
              <Image src={logoWordmark} style={styles.logoWordmark} />
            ) : (
              <Text style={styles.brandName}>{seller.brand}</Text>
            )}
            <View>
              <Text style={styles.brandSub}>Tax Invoice / Bill of Supply</Text>
            </View>
          </View>
          <View>
            <Text style={styles.docTitle}>Tax Invoice/Bill of Supply</Text>
            <Text style={styles.docMeta}>Invoice No.: {invoiceNo}</Text>
            <Text style={styles.docMeta}>Order Id.: {String(orderId)}</Text>
            <Text style={styles.docMeta}>
              Order Date – {formatDate(order.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.threeCol}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Sold By</Text>
            <Text style={{ ...styles.line, fontFamily: "Helvetica-Bold" }}>
              {seller.name}
            </Text>
            <Text style={styles.line}>{seller.address}</Text>
            <Text style={styles.line}>GST No: {seller.gst}</Text>
            <Text style={styles.line}>
              PAN No.: {seller.pan || "Not Provided"}
            </Text>
            {seller.showContact && seller.phone ? (
              <Text style={styles.muted}>Mobile No.: {seller.phone}</Text>
            ) : null}
            {seller.showContact && seller.email ? (
              <Text style={styles.muted}>Email Id.: {seller.email}</Text>
            ) : null}
          </View>
          <PartyBlock
            title="Bill to"
            name={personName(billTo, customerEmail)}
            address={billTo}
            gst={customerGst || "Not Provided"}
            phone={billPhone}
            email={customerEmail || "Not Provided"}
          />
          <PartyBlock
            title="Ship to"
            name={personName(shipTo, customerEmail)}
            address={shipTo}
            gst={customerGst || "Not Provided"}
            phone={shipPhone}
            email={customerEmail || "Not Provided"}
          />
        </View>

        <View style={styles.metaBox}>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.muted}>Payment Method – {paymentMethod}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.muted}>Place of Supply - {placeOfSupply}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.muted}>Order Id.: {String(orderId)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.muted}>Invoice No.: {invoiceNo}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.muted}>
                Order Date – {formatDate(order.created_at)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <HeaderCell width={COL.desc}>Product Name</HeaderCell>
            <HeaderCell width={COL.sku}>Sku.ID/Model</HeaderCell>
            <HeaderCell width={COL.qty} align="center">
              Quantity
            </HeaderCell>
            <HeaderCell width={COL.taxable} align="right">
              Taxable Value
            </HeaderCell>
            <HeaderCell width={COL.rate} align="center">
              Gst. Rate
            </HeaderCell>
            <HeaderCell width={COL.gst} align="right">
              Gst. Amount
            </HeaderCell>
            <HeaderCell width={COL.total} align="right">
              Total
            </HeaderCell>
          </View>

          {productGstLines.map((row) => (
            <View key={row.item_id} style={styles.tableRow} wrap={false}>
              <DataCell width={COL.desc}>{row.title}</DataCell>
              <DataCell width={COL.sku}>{(row as any).sku || "—"}</DataCell>
              <DataCell width={COL.qty} align="center">
                {row.quantity}
              </DataCell>
              <DataCell width={COL.taxable} align="right">
                {formatMoney(row.taxable)}
              </DataCell>
              <DataCell width={COL.rate} align="center">
                {`${row.rate || 0}%`}
              </DataCell>
              <DataCell width={COL.gst} align="right">
                {formatMoney(row.gst)}
              </DataCell>
              <DataCell width={COL.total} align="right">
                {formatMoney(row.inclusive)}
              </DataCell>
            </View>
          ))}

          {/* Shipping Charges — always shown; 0 when free */}
          <View style={styles.tableRow} wrap={false}>
            <DataCell width={COL.desc}>Shipping Charges</DataCell>
            <DataCell width={COL.sku}>Shipping</DataCell>
            <DataCell width={COL.qty} align="center">
              {shippingInclusive > 0 ? 1 : 0}
            </DataCell>
            <DataCell width={COL.taxable} align="right">
              {formatMoney(shippingBreakdown.taxable)}
            </DataCell>
            <DataCell width={COL.rate} align="center">
              {shippingInclusive > 0 ? `${DEFAULT_SHIPPING_GST_RATE}%` : "0%"}
            </DataCell>
            <DataCell width={COL.gst} align="right">
              {formatMoney(shippingBreakdown.gst)}
            </DataCell>
            <DataCell width={COL.total} align="right">
              {formatMoney(shippingInclusive)}
            </DataCell>
          </View>
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Taxable value</Text>
              <Text style={styles.line}>{formatMoney(grandTaxable)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.muted}>GST Amount</Text>
              <Text style={styles.line}>{formatMoney(grandGst)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Shipping Charges</Text>
              <Text style={styles.line}>{formatMoney(shippingInclusive)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
                Total
              </Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
                {formatMoney(grandTotal)} Rs
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.muted}>
            This is a computer-generated invoice from {seller.brand}. Sold by{" "}
            {seller.name}.
            {seller.showContact && seller.email
              ? ` For support contact ${seller.email}${seller.phone ? ` / ${seller.phone}` : ""}.`
              : ""}
          </Text>
          <Text style={styles.muted}>
            Prices are GST-inclusive. Taxable value / GST amount above are a
            breakdown of GST already included in the product price. Free shipping
            is shown as Rs. 0.00.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {seller.brand}
            {seller.name && seller.name !== seller.brand ? ` · ${seller.name}` : ""}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )

  return await renderToBuffer(<InvoiceDocument />)
}
