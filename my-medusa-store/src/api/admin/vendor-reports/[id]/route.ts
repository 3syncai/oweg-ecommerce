import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorReportModuleService from "../../../../modules/vendor-report/service"
import { VENDOR_REPORT_MODULE } from "../../../../modules/vendor-report"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const id = req.params?.id as string
    if (!id) return res.status(400).json({ message: "Report id is required" })

    const reportService: VendorReportModuleService = req.scope.resolve(
      VENDOR_REPORT_MODULE
    )
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)

    const report = await reportService.retrieveVendorReport(id)
    const vendor = await vendorService.retrieveVendor(report.vendor_id).catch(() => null)

    return res.json({
      report: {
        ...report,
        vendor_name: vendor?.store_name || vendor?.name || null,
        vendor_email: vendor?.email || null,
      },
    })
  } catch (error: any) {
    console.error("Admin vendor report get error:", error)
    return res.status(404).json({ message: error?.message || "Report not found" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const id = req.params?.id as string
    if (!id) return res.status(400).json({ message: "Report id is required" })

    const body = ((req as any).body || {}) as {
      status?: "open" | "in_review" | "resolved" | "closed"
      admin_notes?: string | null
    }

    const status = body.status
    if (!status || !["open", "in_review", "resolved", "closed"].includes(status)) {
      return res.status(400).json({ message: "Valid status is required" })
    }

    const reportService: VendorReportModuleService = req.scope.resolve(
      VENDOR_REPORT_MODULE
    )
    const adminId = (req as any).auth_context?.actor_id || null

    const report = await reportService.updateVendorReportStatus(id, {
      status,
      admin_notes: body.admin_notes ?? null,
      resolved_by: adminId,
    })

    return res.json({ report })
  } catch (error: any) {
    console.error("Admin vendor report update error:", error)
    return res.status(500).json({ message: error?.message || "Failed to update report" })
  }
}
