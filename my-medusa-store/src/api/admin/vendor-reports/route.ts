import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorReportModuleService from "../../../modules/vendor-report/service"
import { VENDOR_REPORT_MODULE } from "../../../modules/vendor-report"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const reportService: VendorReportModuleService = req.scope.resolve(
      VENDOR_REPORT_MODULE
    )
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)

    const reports = await reportService.listVendorReports(
      {},
      { order: { created_at: "DESC" }, take: 300 }
    )

    const vendorIds = Array.from(
      new Set((reports || []).map((r: any) => r.vendor_id).filter(Boolean))
    )
    const vendors =
      vendorIds.length > 0
        ? await vendorService.listVendors({ id: vendorIds })
        : []
    const byId = new Map((vendors || []).map((v: any) => [v.id, v]))

    const enriched = (reports || []).map((report: any) => {
      const vendor = byId.get(report.vendor_id)
      return {
        ...report,
        vendor_name: vendor?.store_name || vendor?.name || null,
        vendor_email: vendor?.email || null,
      }
    })

    return res.json({ reports: enriched, count: enriched.length })
  } catch (error: any) {
    console.error("Admin vendor reports list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load reports" })
  }
}
