import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
    createRazorpayContact,
    createRazorpayFundAccount,
    createRazorpayPayout
} from "../../../../../lib/razorpay-payout"

/**
 * Admin Automated Payout API
 * POST /admin/vendor-payouts/razorpay/process
 * 
 * Automatically process payout to vendor via Razorpay:
 * 1. Create Razorpay contact (if not exists)
 * 2. Create fund account with vendor's bank details
 * 3. Initiate payout
 * 4. Record in database
 */

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    try {
        const {
            vendor_id,
            amount, // Net amount to pay (already after commission deduction)
            commission_amount,
            commission_rate,
            order_ids,
            notes,
            razorpay_account_number, // Admin's Razorpay account number (from which money will be debited)
        } = req.body as {
            vendor_id: string
            amount: number // in rupees
            commission_amount?: number
            commission_rate?: number
            order_ids?: string[]
            notes?: string
            razorpay_account_number?: string
        }

        // Validation
        if (!vendor_id || !amount) {
            res.status(400).json({
                message: "vendor_id and amount are required",
            })
            return
        }

        if (amount <= 0) {
            res.status(400).json({
                message: "Amount must be greater than 0",
            })
            return
        }

        // Get vendor details
        const query = req.scope.resolve("query")
        const { data: vendors } = await query.graph({
            entity: "vendor",
            fields: [
                "id",
                "name",
                "email",
                "phone",
                "bank_name",
                "account_no",
                "ifsc_code",
                "metadata",
            ],
            filters: { id: vendor_id },
        })

        const vendor = vendors?.[0]
        if (!vendor) {
            res.status(404).json({
                message: "Vendor not found",
            })
            return
        }

        // Validate vendor bank details
        if (!vendor.bank_name || !vendor.account_no || !vendor.ifsc_code) {
            res.status(400).json({
                message: "Vendor bank details are incomplete. Please update bank_name, account_no, and ifsc_code.",
                vendor_id: vendor.id,
                vendor_name: vendor.name,
            })
            return
        }

        if (!vendor.phone) {
            res.status(400).json({
                message: "Vendor phone number is required",
            })
            return
        }

        // Step 1: Create or get Razorpay Contact
        let razorpayContactId: string | null = null
        const vendorMetadata = vendor.metadata || {}

        if (vendorMetadata.razorpay_contact_id) {
            razorpayContactId = vendorMetadata.razorpay_contact_id
            console.log(`✅ Using existing Razorpay contact: ${razorpayContactId}`)
        } else {
            console.log(`📞 Creating Razorpay contact for vendor: ${vendor.name}`)
            const contact = await createRazorpayContact({
                name: vendor.name,
                email: vendor.email,
                contact: vendor.phone,
                type: "vendor",
                reference_id: vendor.id,
                notes: {
                    vendor_id: vendor.id,
                    created_from: "medusa_admin",
                },
            })

            razorpayContactId = contact.id

            // Update vendor metadata with contact ID
            const manager = req.scope.resolve("manager") as any
            await manager.transaction(async (em: any) => {
                await em.nativeUpdate(
                    "vendor",
                    { id: vendor.id },
                    {
                        metadata: {
                            ...vendorMetadata,
                            razorpay_contact_id: razorpayContactId,
                        },
                    }
                )
            })

            console.log(`✅ Created Razorpay contact: ${razorpayContactId}`)
        }

        // Ensure we have a valid contact ID
        if (!razorpayContactId) {
            res.status(500).json({
                message: "Failed to create or retrieve Razorpay contact ID",
            })
            return
        }

        // Step 2: Create Fund Account
        console.log(`🏦 Creating fund account for: ${vendor.bank_name} - ${vendor.account_no}`)
        const fundAccount = await createRazorpayFundAccount({
            contact_id: razorpayContactId,
            account_type: "bank_account",
            bank_account: {
                name: vendor.name,
                ifsc: vendor.ifsc_code,
                account_number: vendor.account_no,
            },
        })

        console.log(`✅ Created fund account: ${fundAccount.id}`)

        // Step 3: Create Payout
        const amountInPaise = Math.round(amount * 100) // Convert rupees to paise
        const accountNumber = razorpay_account_number || process.env.RAZORPAY_ACCOUNT_NUMBER

        if (!accountNumber) {
            res.status(400).json({
                message: "Razorpay account number not configured. Set RAZORPAY_ACCOUNT_NUMBER environment variable or provide razorpay_account_number in request.",
            })
            return
        }

        console.log(`💰 Initiating payout: ₹${amount} (${amountInPaise} paise)`)

        const internalTxnId = `payout_${vendor.id}_${Date.now()}`

        const payout = await createRazorpayPayout({
            account_number: accountNumber,
            fund_account_id: fundAccount.id,
            amount: amountInPaise,
            currency: "INR",
            mode: "IMPS", // Fastest mode
            purpose: "payout",
            reference_id: internalTxnId,
            narration: `Payment for orders - ${vendor.name}`,
            queue_if_low_balance: true,
            notes: {
                vendor_id: vendor.id,
                vendor_name: vendor.name,
                order_ids: order_ids ? order_ids.join(",") : "",
                ...(notes ? { admin_notes: notes } : {}),
            },
        })

        console.log(`✅ Payout created: ${payout.id} | Status: ${payout.status}`)

        // Step 4: Save to database
        const manager = req.scope.resolve("manager") as any
        const created_by = (req as any).user?.id || "admin"

        const payoutData = {
            vendor_id,
            amount: amount + (commission_amount || 0), // Gross amount before commission
            commission_amount: commission_amount || 0,
            net_amount: amount,
            commission_rate: commission_rate || 0,
            currency_code: "inr",
            transaction_id: internalTxnId,
            payment_method: "razorpay_payout",
            status: payout.status === "processed" ? "processed" : "pending",
            razorpay_contact_id: razorpayContactId,
            razorpay_fund_account_id: fundAccount.id,
            razorpay_payout_id: payout.id,
            razorpay_status: payout.status,
            utr: payout.utr,
            failure_reason: payout.failure_reason,
            notes: notes || null,
            order_ids: order_ids ? JSON.stringify(order_ids) : null,
            created_by,
            created_at: new Date(),
            updated_at: new Date(),
        }

        const result = await manager.transaction(async (em: any) => {
            const payoutEntity = em.create("vendor_payout", payoutData)
            await em.persistAndFlush(payoutEntity)
            return payoutEntity
        })

        res.status(201).json({
            success: true,
            message: "Payout processed successfully",
            payout: {
                id: result.id,
                vendor_id,
                vendor_name: vendor.name,
                amount,
                razorpay_payout_id: payout.id,
                razorpay_status: payout.status,
                utr: payout.utr,
                fund_account_id: fundAccount.id,
                contact_id: razorpayContactId,
            },
        })
    } catch (error: any) {
        console.error("Automated payout error:", error)
        res.status(500).json({
            success: false,
            message: "Failed to process payout",
            error: error?.message || "Unknown error",
        })
    }
}
