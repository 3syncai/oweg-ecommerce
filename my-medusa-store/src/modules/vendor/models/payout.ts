import { model } from "@medusajs/framework/utils"

const Payout = model.define("vendor_payout", {
    id: model.id().primaryKey(),

    // Vendor Relation
    vendor_id: model.text(),

    // Amount Details
    amount: model.float(), // Gross amount before commission
    commission_amount: model.float(), // Commission deducted
    net_amount: model.float(), // Actual amount paid = amount - commission_amount
    commission_rate: model.float(), // Percentage used for this payout
    currency_code: model.text().default("inr"),

    // Payment Details
    transaction_id: model.text(), // Your internal transaction ID
    payment_method: model.text().default("bank_transfer"), // bank_transfer, upi, etc
    status: model.text().default("pending"), // processed, pending, failed

    // Razorpay Integration Fields
    razorpay_contact_id: model.text().nullable(), // Razorpay contact ID (cont_xxxx)
    razorpay_fund_account_id: model.text().nullable(), // Razorpay fund account ID (fa_xxxx)
    razorpay_payout_id: model.text().nullable(), // Razorpay payout ID (pout_xxxx)
    razorpay_status: model.text().nullable(), // queued, pending, processing, processed, reversed, cancelled, rejected
    utr: model.text().nullable(), // UTR number from bank transaction
    failure_reason: model.text().nullable(), // Reason if payout failed

    // Additional Info
    notes: model.text().nullable(),
    order_ids: model.json().nullable(), // Array of order IDs included in this payout
    created_by: model.text().nullable(), // Admin user ID who created this payout
})

export default Payout
