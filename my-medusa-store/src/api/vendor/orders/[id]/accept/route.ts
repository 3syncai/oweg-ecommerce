import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../../_lib/guards"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import VendorModuleService from "../../../../../modules/vendor/service"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  setVendorOrderCorsHeaders,
  updateVendorOrderWorkflow,
} from "../../../../../lib/vendor-order-workflow"
import {
  ensureOrderSettlementSnapshots,
  readOrderSettlementRates,
  resolveLiveSettlementRates,
} from "../../../../../lib/vendor-settlement-snapshot"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const orderStatus = String(result.order.status || "").toLowerCase()
    if (orderStatus === "canceled" || orderStatus === "cancelled") {
      return res.status(409).json({ message: "This order was cancelled by admin. Do not accept or ship it." })
    }

    const workflow = getVendorWorkflow(result.order.metadata, auth.vendor_id)
    if (workflow.stage && workflow.stage !== "to_accept") {
      return res.status(409).json({ message: "Order is already accepted" })
    }

    let vendorName: string | null = null
    let storeName: string | null = null
    let vendorEmail: string | null = null
    try {
      const vendorService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
      const vendor = await vendorService.retrieveVendor(auth.vendor_id)
      vendorName = vendor?.name || null
      storeName = vendor?.store_name || null
      vendorEmail = vendor?.email || null
    } catch {
      // Acceptance still proceeds if vendor profile lookup fails
    }

    let settlementRates = readOrderSettlementRates(
      result.order.metadata,
      auth.vendor_id
    )
    if (!settlementRates && process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        const snaps = await ensureOrderSettlementSnapshots({
          orderId,
          pool,
          vendorIds: [auth.vendor_id],
          scope: req.scope,
        })
        settlementRates =
          snaps[auth.vendor_id] ||
          (await resolveLiveSettlementRates(auth.vendor_id, pool))
      } finally {
        await pool.end()
      }
    }

    const metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
      stage: "to_pack",
      accepted_at: new Date().toISOString(),
      vendor_name: vendorName,
      store_name: storeName,
      vendor_email: vendorEmail,
      ...(settlementRates ? { settlement_rates: settlementRates } : {}),
    })

    return res.json({
      order: formatVendorOrder({ ...result.order, metadata }, auth.vendor_id, result.vendorProductIds),
    })
  } catch (error: any) {
    console.error("Vendor order accept error:", error)
    return res.status(500).json({ message: error?.message || "Failed to accept order" })
  }
}
