import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import VendorReport from "./models/vendor-report"

class VendorReportModuleService extends MedusaService({
  VendorReport,
}) {
  async createVendorReport(input: {
    vendor_id: string
    order_id: string
    order_display_id?: string | null
    return_request_id?: string | null
    source: "return" | "order_lookup"
    issue_title: string
    issue_description: string
    product_snapshot?: any
    order_snapshot?: any
    image_urls?: string[]
    metadata?: Record<string, unknown> | null
  }) {
    const title = String(input.issue_title || "").trim()
    const description = String(input.issue_description || "").trim()
    if (!title || title.length < 3) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Issue title is required")
    }
    if (!description || description.length < 10) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Please describe the issue in a short paragraph (at least 10 characters)"
      )
    }
    if (!input.order_id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order is required")
    }

    const created = await this.createVendorReports({
      vendor_id: input.vendor_id,
      order_id: input.order_id,
      order_display_id: input.order_display_id || null,
      return_request_id: input.return_request_id || null,
      source: input.source,
      issue_title: title.slice(0, 200),
      issue_description: description.slice(0, 5000),
      product_snapshot: input.product_snapshot || null,
      order_snapshot: input.order_snapshot || null,
      image_urls: (input.image_urls || []) as unknown as Record<string, unknown>,
      status: "open",
      metadata: input.metadata || null,
    })

    return Array.isArray(created) ? created[0] : created
  }

  async updateVendorReportStatus(
    id: string,
    input: {
      status: "open" | "in_review" | "resolved" | "closed"
      admin_notes?: string | null
      approved_amount?: number | null
      resolved_by?: string | null
    }
  ) {
    const existing = await this.retrieveVendorReport(id)
    if (!existing) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Report not found")
    }

    const patch: Record<string, any> = {
      id,
      status: input.status,
    }
    if (input.admin_notes !== undefined) {
      patch.admin_notes = input.admin_notes
    }
    if (input.approved_amount !== undefined) {
      const amount = Number(input.approved_amount)
      if (!Number.isFinite(amount) || amount < 0) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "approved_amount must be a non-negative number"
        )
      }
      patch.approved_amount = Math.round(amount * 100) / 100
    }
    if (input.status === "resolved" || input.status === "closed") {
      patch.resolved_at = new Date()
      patch.resolved_by = input.resolved_by || null
    }
    if (input.status === "open" || input.status === "in_review") {
      patch.resolved_at = null
      patch.resolved_by = null
    }

    const updated = await this.updateVendorReports(patch)
    return Array.isArray(updated) ? updated[0] : updated
  }
}

export default VendorReportModuleService
