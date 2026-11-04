import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import {
  createRazorpayContact,
  createRazorpayFundAccount,
  createRazorpayPayout,
} from "../../../../../lib/razorpay-payout"
import {
  isRazorpayPayoutSettled,
  listOrderIdsAlreadyOnPayout,
  lockVendorPayoutRowsForVendor,
  markVendorEarningsAsPaid,
  normalizePayoutOrderIds,
} from "../../../../../lib/vendor-earnings"

/**
 * Admin Automated Payout API
 * POST /admin/vendor-payouts/razorpay/process
 *
 * Earnings are marked PAID only when Razorpay status is `processed`.
 * `order_ids` is required so sibling CREDITED rows are never wiped.
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

    const scopedOrderIds = normalizePayoutOrderIds(order_ids)

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

    if (scopedOrderIds.length === 0) {
      res.status(400).json({
        message:
          "order_ids are required. Refusing to mark all CREDITED earnings as paid.",
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
        message:
          "Vendor bank details are incomplete. Please update bank_name, account_no, and ifsc_code.",
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

    const claimPool = new Pool({ connectionString: process.env.DATABASE_URL })
    const claimClient = await claimPool.connect()
    try {
      await claimClient.query("BEGIN")
      await lockVendorPayoutRowsForVendor(claimClient, vendor_id)
      const alreadyClaimed = await listOrderIdsAlreadyOnPayout(
        claimClient as any,
        vendor_id,
        scopedOrderIds
      )
      if (alreadyClaimed.length > 0) {
        await claimClient.query("ROLLBACK")
        res.status(409).json({
          message:
            "One or more orders are already on a pending or completed payout",
          order_ids: alreadyClaimed,
        })
        return
      }
      // Reserve a pending payout row before calling Razorpay so concurrent
      // admins cannot claim the same order_ids.
      const reserveId = `vpayout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await claimClient.query(
        `
          INSERT INTO vendor_payout (
            id, vendor_id, amount, commission_amount, net_amount, commission_rate,
            currency_code, transaction_id, payment_method, status, notes, order_ids,
            created_by, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            'inr', $7, 'razorpay_payout', 'pending', $8, $9,
            $10, NOW(), NOW()
          )
        `,
        [
          reserveId,
          vendor_id,
          amount + (commission_amount || 0),
          commission_amount || 0,
          amount,
          commission_rate || 0,
          `reserve_${reserveId}`,
          notes || null,
          JSON.stringify(scopedOrderIds),
          (req as any).auth_context?.actor_id || (req as any).user?.id || "admin",
        ]
      )
      await claimClient.query("COMMIT")
      ;(req as any)._reserved_payout_id = reserveId
    } catch (error: any) {
      await claimClient.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      claimClient.release()
      await claimPool.end().catch(() => {})
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

    if (!razorpayContactId) {
      res.status(500).json({
        message: "Failed to create or retrieve Razorpay contact ID",
      })
      return
    }

    // Step 2: Create Fund Account
    console.log(
      `🏦 Creating fund account for: ${vendor.bank_name} - ${vendor.account_no}`
    )
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
    const amountInPaise = Math.round(amount * 100)
    const accountNumber =
      razorpay_account_number || process.env.RAZORPAY_ACCOUNT_NUMBER

    if (!accountNumber) {
      res.status(400).json({
        message:
          "Razorpay account number not configured. Set RAZORPAY_ACCOUNT_NUMBER environment variable or provide razorpay_account_number in request.",
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
      mode: "IMPS",
      purpose: "payout",
      reference_id: internalTxnId,
      narration: `Payment for orders - ${vendor.name}`,
      queue_if_low_balance: true,
      notes: {
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        order_ids: scopedOrderIds.join(","),
        ...(notes ? { admin_notes: notes } : {}),
      },
    })

    console.log(`✅ Payout created: ${payout.id} | Status: ${payout.status}`)

    const settled = isRazorpayPayoutSettled(payout.status)
    const localStatus = settled ? "processed" : "pending"
    const reservedPayoutId = String((req as any)._reserved_payout_id || "")
    const created_by =
      (req as any).auth_context?.actor_id || (req as any).user?.id || "admin"

    // Step 4: Update the reserved payout row (do not insert a second claim)
    const updatePool = new Pool({ connectionString: process.env.DATABASE_URL })
    let result: { id: string } = { id: reservedPayoutId }
    try {
      if (!reservedPayoutId) {
        throw new Error("Missing reserved payout id")
      }
      await updatePool.query(
        `
          UPDATE vendor_payout SET
            amount = $2,
            commission_amount = $3,
            net_amount = $4,
            commission_rate = $5,
            transaction_id = $6,
            status = $7,
            razorpay_contact_id = $8,
            razorpay_fund_account_id = $9,
            razorpay_payout_id = $10,
            razorpay_status = $11,
            utr = $12,
            failure_reason = $13,
            notes = $14,
            created_by = $15,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          reservedPayoutId,
          amount + (commission_amount || 0),
          commission_amount || 0,
          amount,
          commission_rate || 0,
          internalTxnId,
          localStatus,
          razorpayContactId,
          fundAccount.id,
          payout.id,
          payout.status,
          payout.utr || null,
          payout.failure_reason || null,
          notes || null,
          created_by,
        ]
      )
      result = { id: reservedPayoutId }
    } finally {
      await updatePool.end().catch(() => {})
    }

    // Mark CREDITED → PAID only after Razorpay confirms processed
    let markedPaid = 0
    if (settled) {
      const markPool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        markedPaid = await markVendorEarningsAsPaid(
          vendor_id,
          markPool,
          scopedOrderIds
        )
      } catch (markErr) {
        console.error("Failed to mark earnings as PAID:", markErr)
      } finally {
        await markPool.end().catch(() => {})
      }
    } else {
      console.log(
        `[razorpay-payout] Leaving earnings CREDITED until Razorpay settles (status=${payout.status})`
      )
    }

    res.status(201).json({
      success: true,
      message: settled
        ? "Payout processed successfully"
        : `Payout submitted (${payout.status}). Earnings stay available until Razorpay reports processed.`,
      payout: {
        id: result.id,
        vendor_id,
        vendor_name: vendor.name,
        amount,
        status: localStatus,
        order_ids: scopedOrderIds,
        razorpay_payout_id: payout.id,
        razorpay_status: payout.status,
        utr: payout.utr,
        fund_account_id: fundAccount.id,
        contact_id: razorpayContactId,
        earnings_marked_paid: markedPaid,
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
