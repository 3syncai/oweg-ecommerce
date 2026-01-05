import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

/**
 * Admin Vendor Payouts API
 * GET  /admin/vendor-payouts - List all payouts
 * POST /admin/vendor-payouts - Create a new payout
 */

export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    try {
        // TODO: Implement proper payout storage
        // For now, return empty array since payout model needs proper DML registration
        res.json({
            payouts: [],
            count: 0,
        })
    } catch (error: any) {
        console.error("List payouts error:", error)
        res.status(500).json({
            message: "Failed to fetch payouts",
            error: error?.message || "Unknown error",
        })
    }
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    try {
        const {
            vendor_id,
            amount,
            commission_amount,
            net_amount,
            commission_rate,
            transaction_id,
            payment_method = "bank_transfer",
            notes,
            order_ids,
        } = req.body as {
            vendor_id: string
            amount: number
            commission_amount: number
            net_amount: number
            commission_rate: number
            transaction_id: string
            payment_method?: string
            notes?: string
            order_ids?: string[]
        }

        // Validation
        if (!vendor_id || !amount || !transaction_id) {
            res.status(400).json({
                message: "vendor_id, amount, and transaction_id are required",
            })
            return
        }

        // Get the admin user ID from session (if available)
        const created_by = (req as any).user?.id || "admin"

        // Create payout record
        const query = req.scope.resolve("query")

        const payoutData = {
            vendor_id,
            amount,
            commission_amount: commission_amount || 0,
            net_amount: net_amount || amount,
            commission_rate: commission_rate || 0,
            currency_code: "inr",
            transaction_id,
            payment_method,
            status: "processed", // Mark as processed immediately
            notes: notes || null,
            order_ids: order_ids ? JSON.stringify(order_ids) : null,
            created_by,
            created_at: new Date(),
            updated_at: new Date(),
        }

        const { data: [payout] } = await query.graph({
            entity: "vendor_payout",
            fields: ["*"],
            filters: { id: null }, // Will create new
        }).then(() =>
            // Use container to create
            req.scope.resolve("query").graph({
                entity: "vendor_payout",
                fields: ["id"],
            }).then(async () => {
                // Direct insert via container
                const container = req.scope
                const manager = container.resolve("manager")

                const result = await manager.transaction(async (em: any) => {
                    const payoutEntity = em.create("vendor_payout", payoutData)
                    await em.persistAndFlush(payoutEntity)
                    return payoutEntity
                })

                return { data: [result] }
            })
        )

        res.status(201).json({
            success: true,
            message: "Payout created successfully",
            payout: payout || payoutData,
        })
    } catch (error: any) {
        console.error("Create payout error:", error)
        res.status(500).json({
            message: "Failed to create payout",
            error: error?.message || "Unknown error",
        })
    }
}
