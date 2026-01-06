import crypto from "crypto";

const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

function getAuthHeader() {
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
        throw new Error("Missing Razorpay credentials: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
    }
    const token = Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
    return `Basic ${token}`;
}

/**
 * Create a Razorpay Contact for a vendor
 * https://razorpay.com/docs/api/payouts/contacts/
 */
export async function createRazorpayContact(params: {
    name: string;
    email: string;
    contact: string; // phone number
    type: "vendor" | "customer" | "employee";
    reference_id: string; // vendor ID
    notes?: Record<string, string>;
}) {
    const res = await fetch("https://api.razorpay.com/v1/contacts", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            Authorization: getAuthHeader(),
        },
        body: JSON.stringify(params),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Razorpay create contact failed (${res.status}): ${text}`);
    }

    return (await res.json()) as {
        id: string;
        entity: string;
        name: string;
        contact: string;
        email: string;
        type: string;
        reference_id: string;
        batch_id: string | null;
        active: boolean;
        notes: Record<string, string>;
        created_at: number;
    };
}

/**
 * Create a Fund Account for contact
 * https://razorpay.com/docs/api/payouts/fund-accounts/
 */
export async function createRazorpayFundAccount(params: {
    contact_id: string;
    account_type: "bank_account" | "vpa";
    bank_account?: {
        name: string; // Account holder name
        ifsc: string;
        account_number: string;
    };
    vpa?: {
        address: string; // UPI ID
    };
}) {
    const res = await fetch("https://api.razorpay.com/v1/fund_accounts", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            Authorization: getAuthHeader(),
        },
        body: JSON.stringify(params),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Razorpay create fund account failed (${res.status}): ${text}`);
    }

    return (await res.json()) as {
        id: string;
        entity: string;
        contact_id: string;
        account_type: string;
        bank_account?: {
            ifsc: string;
            bank_name: string;
            name: string;
            notes: any[];
            account_number: string;
        };
        vpa?: {
            username: string;
            handle: string;
            address: string;
        };
        batch_id: string | null;
        active: boolean;
        created_at: number;
    };
}

/**
 * Create a Payout
 * https://razorpay.com/docs/api/payouts/create/
 */
export async function createRazorpayPayout(params: {
    account_number: string; // Your Razorpay account number (from where money is deducted)
    fund_account_id: string; // Vendor's fund account ID
    amount: number; // Amount in paise (100 paise = 1 rupee)
    currency: string; // "INR"
    mode: "IMPS" | "NEFT" | "RTGS" | "UPI"; // Payment mode
    purpose: string; // "payout", "vendor_bill", etc.
    queue_if_low_balance?: boolean;
    reference_id?: string; // Your internal reference (e.g., payout ID)
    narration?: string; // Will appear in vendor's bank statement
    notes?: Record<string, string>;
}) {
    const res = await fetch("https://api.razorpay.com/v1/payouts", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            Authorization: getAuthHeader(),
        },
        body: JSON.stringify(params),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Razorpay create payout failed (${res.status}): ${text}`);
    }

    return (await res.json()) as {
        id: string; // Razorpay payout ID (e.g., pout_xxxx)
        entity: string;
        fund_account_id: string;
        amount: number; // in paise
        currency: string;
        notes: Record<string, string>;
        fees: number;
        tax: number;
        status: "queued" | "pending" | "processing" | "processed" | "reversed" | "cancelled" | "rejected";
        purpose: string;
        utr: string | null; // UTR number (null initially, populated when processed)
        mode: string;
        reference_id: string;
        narration: string;
        batch_id: string | null;
        failure_reason: string | null;
        created_at: number;
    };
}

/**
 * Get details of a specific payout
 */
export async function getRazorpayPayout(payoutId: string) {
    const res = await fetch(`https://api.razorpay.com/v1/payouts/${payoutId}`, {
        method: "GET",
        headers: {
            Authorization: getAuthHeader(),
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Razorpay get payout failed (${res.status}): ${text}`);
    }

    return await res.json();
}
