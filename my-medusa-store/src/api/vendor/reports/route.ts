import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import VendorReportModuleService from "../../../modules/vendor-report/service"
import { VENDOR_REPORT_MODULE } from "../../../modules/vendor-report"
import {
  getVendorOrderOrRespond,
  pickVendorItems,
} from "../../../lib/vendor-order-workflow"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const reportService: VendorReportModuleService = req.scope.resolve(
      VENDOR_REPORT_MODULE
    )
    const reports = await reportService.listVendorReports(
      { vendor_id: auth.vendor_id },
      { order: { created_at: "DESC" }, take: 200 }
    )
    return res.json({ reports })
  } catch (error: any) {
    console.error("Vendor reports list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load reports" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const body = ((req as any).body || {}) as {
      order_id?: string
      return_request_id?: string | null
      source?: "return" | "order_lookup"
      issue_title?: string
      issue_description?: string
      image_urls?: string[]
    }

    const orderId = String(body.order_id || "").trim()
    if (!orderId) {
      return res.status(400).json({ message: "order_id is required" })
    }

    const orderResult = await getVendorOrderOrRespond(
      req,
      res,
      auth.vendor_id,
      orderId
    )
    if (!orderResult) return

    const vendorItems = pickVendorItems(
      orderResult.order,
      orderResult.vendorProductIds
    )
    const productSnapshot = vendorItems.map((item: any) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      variant_sku: item.variant_sku || item.variant?.sku || null,
      product_id: item.product_id || item.variant?.product_id || null,
    }))

    const address =
      orderResult.order.shipping_address || orderResult.order.billing_address || {}
    const orderSnapshot = {
      id: orderResult.order.id,
      display_id: orderResult.order.display_id,
      email: orderResult.order.email,
      created_at: orderResult.order.created_at,
      currency_code: orderResult.order.currency_code,
      status: orderResult.order.status,
      shipping_address: address,
      customer_id: (orderResult.order as any).customer_id || null,
    }

    const imageUrls = Array.isArray(body.image_urls)
      ? body.image_urls.map((u) => String(u)).filter(Boolean).slice(0, 8)
      : []

    const reportService: VendorReportModuleService = req.scope.resolve(
      VENDOR_REPORT_MODULE
    )
    const report = await reportService.createVendorReport({
      vendor_id: auth.vendor_id,
      order_id: orderId,
      order_display_id:
        orderResult.order.display_id != null
          ? String(orderResult.order.display_id)
          : null,
      return_request_id: body.return_request_id || null,
      source: body.source === "return" ? "return" : "order_lookup",
      issue_title: String(body.issue_title || ""),
      issue_description: String(body.issue_description || ""),
      product_snapshot: productSnapshot,
      order_snapshot: orderSnapshot,
      image_urls: imageUrls,
    })

    return res.status(201).json({ report })
  } catch (error: any) {
    console.error("Vendor report create error:", error)
    const status = /required|describe|Invalid/i.test(String(error?.message || ""))
      ? 400
      : 500
    return res.status(status).json({ message: error?.message || "Failed to create report" })
  }
}
