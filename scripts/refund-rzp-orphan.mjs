/**
 * Refund a verified Razorpay orphan capture (Medusa draft gone).
 * Usage: node scripts/refund-rzp-orphan.mjs pay_xxx [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const paymentId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  for (const rel of [".env", "my-medusa-store/.env"]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

loadEnv();
if (!paymentId) {
  console.error("Usage: node scripts/refund-rzp-orphan.mjs pay_xxx");
  process.exit(1);
}

const auth = Buffer.from(
  `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
).toString("base64");

const payRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
  headers: { Authorization: `Basic ${auth}` },
});
const payment = await payRes.json();
console.log("payment", {
  id: payment.id,
  status: payment.status,
  amount: payment.amount,
  notes: payment.notes,
});

if (String(payment.status).toLowerCase() !== "captured") {
  console.error("Not captured — abort");
  process.exit(1);
}

if (dryRun) {
  console.log("dry-run: would refund", payment.amount);
  process.exit(0);
}

const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    amount: payment.amount,
    notes: {
      reason: "orphan_capture_medusa_draft_deleted",
      medusa_order_id: payment.notes?.medusa_order_id || "",
    },
  }),
});
const refund = await refundRes.json();
console.log("refund_status", refundRes.status, refund);

const out = path.join(root, "docs", "incident-bash-orphan.json");
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      medusaOrderId: "order_01M1BASHRGEV90PZ7JSK1GSETF",
      razorpayPaymentId: paymentId,
      razorpayOrderId: payment.order_id,
      amountPaise: payment.amount,
      action: "refund",
      refund,
    },
    null,
    2
  )
);
console.log("wrote", out);
if (!refundRes.ok) process.exit(1);
