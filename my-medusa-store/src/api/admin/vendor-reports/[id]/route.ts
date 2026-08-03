import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import VendorReportModuleService from "../../../../modules/vendor-report/service"
import { VENDOR_REPORT_MODULE } from "../../../../modules/vendor-report"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { upsertVendorClaimCredit } from "../../../../lib/vendor-earnings"

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
      approved_amount?: number | string | null
    }

    const status = body.status
    if (!status || !["open", "in_review", "resolved", "closed"].includes(status)) {
      return res.status(400).json({ message: "Valid status is required" })
    }

    const amountRaw =
      body.approved_amount === undefined || body.approved_amount === null || body.approved_amount === ""
        ? undefined
        : Number(body.approved_amount)

    if (amountRaw !== undefined && (!Number.isFinite(amountRaw) || amountRaw < 0)) {
      return res.status(400).json({ message: "approved_amount must be a non-negative number" })
    }

    if ((status === "resolved" || status === "closed") && amountRaw !== undefined && amountRaw > 0) {
      // ok — will credit
    } else if (
      (status === "resolved" || status === "closed") &&
      amountRaw === undefined
    ) {
      // allow close without amount (notes only)
    }

    // Ensure claim settlement column exists (migration may lag behind deploy)
    if (process.env.DATABASE_URL) {
      const ensurePool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        await ensurePool.query(`
          ALTER TABLE vendor_report
          ADD COLUMN IF NOT EXISTS approved_amount numeric null
        `)
      } finally {
        await ensurePool.end().catch(() => undefined)
      }
    }

    const reportService: VendorReportModuleService = req.scope.resolve(
      VENDOR_REPORT_MODULE
    )
    const adminId = (req as any).auth_context?.actor_id || null

    const report = await reportService.updateVendorReportStatus(id, {
      status,
      admin_notes: body.admin_notes ?? null,
      approved_amount: amountRaw,
      resolved_by: adminId,
    })

    let claimCredit: { credited: boolean; net_amount: number } | null = null
    const finalAmount = Number(report?.approved_amount ?? amountRaw ?? 0)
    if (
      (status === "resolved" || status === "closed") &&
      finalAmount > 0 &&
      process.env.DATABASE_URL
    ) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        claimCredit = await upsertVendorClaimCredit(
          String(report.vendor_id),
          String(report.id),
          finalAmount,
          pool,
          {
            order_display_id: report.order_display_id || null,
            claim_title: report.issue_title || null,
          }
        )
      } catch (creditErr) {
        console.error("[admin vendor-report] claim credit failed:", creditErr)
      } finally {
        await pool.end().catch(() => undefined)
      }
    }

    return res.json({ report, claim_credit: claimCredit })
  } catch (error: any) {
    console.error("Admin vendor report update error:", error)
    return res.status(500).json({ message: error?.message || "Failed to update report" })
  }
}
