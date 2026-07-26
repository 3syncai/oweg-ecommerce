import React from "react"
import fs from "fs"
import path from "path"
import { getItemUnits, getItemUnitPrice } from "../lib/vendor-order-workflow"

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

function loadOwegLogoDataUri(): string | null {
  const candidates = [
    path.join(process.cwd(), "assets", "oweg_logo.png"),
    path.join(process.cwd(), "my-medusa-store", "assets", "oweg_logo.png"),
    path.join(__dirname, "../../assets/oweg_logo.png"),
  ]
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

function sellerProfile() {
  return {
    brand: process.env.INVOICE_SELLER_BRAND || "OWEG",
    legal: process.env.INVOICE_SELLER_LEGAL || "Ascent Retechno India Pvt Ltd",
    address:
      process.env.INVOICE_SELLER_ADDRESS ||
      "AV SIGNATURE RESIDENCY, NH-57 SHOP NO 001, A BLOCK, BASUDEVPUR DARBHANGA, BIHAR - 846005",
    gst: process.env.INVOICE_SELLER_GST || "10AAWCA5289L1Z3",
    phone: process.env.INVOICE_SELLER_PHONE || "8956085313",
    email: process.env.INVOICE_SELLER_EMAIL || "support@oweg.in",
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

function addressLines(address: any): string[] {
  if (!address) return []
  return [
    `${address.first_name || ""} ${address.last_name || ""}`.trim(),
    address.company,
    address.address_1,
    address.address_2,
    [address.city, address.postal_code].filter(Boolean).join(" "),
    address.province,
    String(address.country_code || "IN").toUpperCase() === "IN"
      ? "India"
      : address.country_code,
    address.phone ? `Phone: ${address.phone}` : null,
  ].filter(Boolean) as string[]
}

function shortSku(raw: string): string {
  const s = String(raw || "").trim()
  if (!s || s === "—") return "—"
  if (s.length <= 18) return s
  return `…${s.slice(-14)}`
}

export const generateInvoice = async (order: any) => {
  const { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } =
    await import("@react-pdf/renderer")

  const seller = sellerProfile()
  const logo = loadOwegLogoDataUri()
  const billTo = order.billing_address || order.shipping_address || {}
  const shipTo = order.shipping_address || order.billing_address || {}
  const items = Array.isArray(order.items) ? order.items : []

  const lineRows = items.map((item: any) => {
    const qty = getItemUnits(item)
    const unit = getItemUnitPrice(item)
    const skuRaw =
      item.variant_sku || item.variant?.sku || item.sku || item.product_id || "—"
    return {
      id: item.id,
      title: String(item.title || "Item"),
      sku: shortSku(skuRaw),
      qty,
      unit,
      lineTotal: unit * qty,
    }
  })

  const subtotal =
    order.subtotal != null
      ? Number(order.subtotal)
      : lineRows.reduce((s: number, r: any) => s + r.lineTotal, 0)
  const shipping = Number(order.shipping_total || order.shipping_amount || 0) || 0
  const tax = Number(order.tax_total || 0) || 0
  const total =
    order.total != null ? Number(order.total) : subtotal + shipping + tax

  const invoiceNo =
    order.invoice_number ||
    `INV-${order.display_id || String(order.id || "").slice(-8)}`
  const orderId = order.display_id || order.id
  const customerGst =
    order.customer_gstin ||
    order.customer?.gst_number ||
    order.metadata?.customer_gstin ||
    null
  const customerBusiness =
    order.customer_business_name || order.customer?.company_name || null
  const paymentMethod = resolvePaymentMethod(order)

  // Fixed column widths (points) — more reliable than % on Text nodes
  const COL = {
    desc: 200,
    sku: 95,
    qty: 40,
    price: 90,
    total: 90,
  }

  const styles = StyleSheet.create({
    page: {
      flexDirection: "column",
      backgroundColor: "#FFFFFF",
      paddingTop: 28,
      paddingBottom: 40,
      paddingHorizontal: 28,
      fontFamily: "Helvetica",
      fontSize: 9,
      color: "#111111",
    },
    brandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
      borderBottomWidth: 1.5,
      borderBottomColor: "#1B7A4E",
      paddingBottom: 12,
    },
    brandLeft: { flexDirection: "row", alignItems: "center", maxWidth: 320 },
    logo: { width: 40, height: 40, marginRight: 10 },
    brandName: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: "#1B7A4E",
    },
    brandSub: { fontSize: 8, color: "#666666", marginTop: 2 },
    docTitle: {
      fontSize: 16,
      fontFamily: "Helvetica-Bold",
      textAlign: "right",
    },
    docMeta: { fontSize: 8, color: "#555555", textAlign: "right", marginTop: 2 },
    twoCol: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    col: { width: "48%" },
    sectionTitle: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      marginBottom: 5,
      color: "#1B7A4E",
    },
    line: { fontSize: 8, marginBottom: 2, color: "#222222" },
    muted: { fontSize: 8, color: "#666666", marginBottom: 2 },
    metaBox: {
      backgroundColor: "#F5F8F6",
      borderWidth: 1,
      borderColor: "#D7E5DC",
      padding: 8,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
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
      paddingVertical: 6,
      paddingHorizontal: 5,
      justifyContent: "center",
    },
    thText: {
      color: "#FFFFFF",
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
    },
    tdText: { fontSize: 8, color: "#222222" },
    right: { textAlign: "right" },
    center: { textAlign: "center" },
    totalsWrap: { marginTop: 12, alignItems: "flex-end" },
    totalsBox: {
      width: 220,
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
      left: 28,
      right: 28,
      borderTopWidth: 1,
      borderTopColor: "#EEEEEE",
      paddingTop: 6,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerText: { fontSize: 7, color: "#888888" },
  })

  const HeaderCell = ({
    width,
    children,
    align,
  }: {
    width: number
    children: string
    align?: "left" | "center" | "right"
  }) => (
    <View style={[styles.cell, { width }]}>
      <Text
        style={[
          styles.thText,
          align === "right" ? styles.right : null,
          align === "center" ? styles.center : null,
        ]}
      >
        {children}
      </Text>
    </View>
  )

  const DataCell = ({
    width,
    children,
    align,
  }: {
    width: number
    children: string | number
    align?: "left" | "center" | "right"
  }) => (
    <View style={[styles.cell, { width }]}>
      <Text
        style={[
          styles.tdText,
          align === "right" ? styles.right : null,
          align === "center" ? styles.center : null,
        ]}
      >
        {String(children)}
      </Text>
    </View>
  )

  const InvoiceDocument = () => (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <View>
              <Text style={styles.brandName}>{seller.brand}</Text>
              <Text style={styles.brandSub}>{seller.legal}</Text>
              <Text style={styles.brandSub}>Tax Invoice / Bill of Supply</Text>
            </View>
          </View>
          <View>
            <Text style={styles.docTitle}>INVOICE</Text>
            <Text style={styles.docMeta}>Invoice No. {invoiceNo}</Text>
            <Text style={styles.docMeta}>Order ID: {String(orderId)}</Text>
            <Text style={styles.docMeta}>Date: {formatDate(order.created_at)}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Sold By</Text>
            <Text style={{ ...styles.line, fontFamily: "Helvetica-Bold" }}>
              {seller.brand}
            </Text>
            <Text style={styles.line}>{seller.legal}</Text>
            <Text style={styles.line}>{seller.address}</Text>
            <Text style={styles.line}>GSTIN: {seller.gst}</Text>
            <Text style={styles.muted}>Telephone: {seller.phone}</Text>
            <Text style={styles.muted}>E-Mail: {seller.email}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            {addressLines(billTo).map((line, idx) => (
              <Text key={`b-${idx}`} style={styles.line}>
                {line}
              </Text>
            ))}
            {order.email ? (
              <Text style={styles.muted}>Email: {order.email}</Text>
            ) : null}
            {customerBusiness ? (
              <Text style={styles.line}>Business: {customerBusiness}</Text>
            ) : null}
            {customerGst ? (
              <Text style={{ ...styles.line, fontFamily: "Helvetica-Bold" }}>
                Customer GSTIN: {customerGst}
              </Text>
            ) : (
              <Text style={styles.muted}>Customer GSTIN: Not provided</Text>
            )}
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Ship To</Text>
            {addressLines(shipTo).map((line, idx) => (
              <Text key={`s-${idx}`} style={styles.line}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.col}>
            <View style={styles.metaBox}>
              <View style={styles.metaRow}>
                <Text style={styles.muted}>Payment Method</Text>
                <Text style={styles.line}>{paymentMethod}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.muted}>Order Date</Text>
                <Text style={styles.line}>{formatDate(order.created_at)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.muted}>Place of supply</Text>
                <Text style={styles.line}>
                  {shipTo.province || billTo.province || "India"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <HeaderCell width={COL.desc}>Product</HeaderCell>
            <HeaderCell width={COL.sku}>SKU</HeaderCell>
            <HeaderCell width={COL.qty} align="center">
              Qty
            </HeaderCell>
            <HeaderCell width={COL.price} align="right">
              Unit Price
            </HeaderCell>
            <HeaderCell width={COL.total} align="right">
              Total
            </HeaderCell>
          </View>
          {lineRows.map((row: any) => (
            <View key={row.id} style={styles.tableRow} wrap={false}>
              <DataCell width={COL.desc}>{row.title}</DataCell>
              <DataCell width={COL.sku}>{row.sku}</DataCell>
              <DataCell width={COL.qty} align="center">
                {row.qty}
              </DataCell>
              <DataCell width={COL.price} align="right">
                {formatMoney(row.unit)}
              </DataCell>
              <DataCell width={COL.total} align="right">
                {formatMoney(row.lineTotal)}
              </DataCell>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Sub-Total</Text>
              <Text style={styles.line}>{formatMoney(subtotal)}</Text>
            </View>
            {shipping > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>Shipping Charges</Text>
                <Text style={styles.line}>{formatMoney(shipping)}</Text>
              </View>
            ) : null}
            {tax > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>Tax</Text>
                <Text style={styles.line}>{formatMoney(tax)}</Text>
              </View>
            ) : null}
            <View style={styles.grandRow}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
                Total
              </Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
                {formatMoney(total)}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.muted}>
            This is a computer-generated invoice from {seller.brand}. Sold by{" "}
            {seller.brand} ({seller.legal}).
          </Text>
          <Text style={styles.muted}>
            For support contact {seller.email} / {seller.phone}.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {seller.brand} · {seller.legal}
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
