/**
 * Incident check: was order_01M1BASH… charged on Razorpay?
 * Usage: node scripts/incident-check-rzp-orphan.mjs [medusaOrderId]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const TARGET = process.argv[2] || "order_01M1BASHRGEV90PZ7JSK1GSETF";

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
const key = process.env.RAZORPAY_KEY_ID;
const secret = process.env.RAZORPAY_KEY_SECRET;
const db = process.env.DATABASE_URL;
if (!key || !secret) {
  console.error("Missing Razorpay keys");
  process.exit(1);
}

const auth = Buffer.from(`${key}:${secret}`).toString("base64");

async function rzp(pathSuffix) {
  const res = await fetch(`https://api.razorpay.com${pathSuffix}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const pool = db
  ? new pg.Pool({
      connectionString: db,
      ssl: db.includes("amazonaws.com") ? { rejectUnauthorized: false } : undefined,
    })
  : null;

const medusa = pool
  ? await pool.query(`SELECT id, display_id, status, metadata FROM "order" WHERE id = $1`, [
      TARGET,
    ])
  : { rows: [] };

const paymentsRes = await rzp("/v1/payments?count=100");
const payments = paymentsRes.data?.items || [];
const orderIds = [...new Set(payments.map((p) => p.order_id).filter(Boolean))];

const hits = [];
for (const oid of orderIds) {
  const ord = await rzp(`/v1/orders/${encodeURIComponent(oid)}`);
  const o = ord.data || {};
  const receiptMatch = o.receipt === TARGET;
  const notesMatch = o.notes?.medusa_order_id === TARGET;
  const blobMatch = JSON.stringify(o).includes("BASH");
  if (!receiptMatch && !notesMatch && !blobMatch) continue;
  const pays = await rzp(`/v1/orders/${encodeURIComponent(oid)}/payments`);
  hits.push({
    rzp_order: oid,
    receipt: o.receipt,
    notes: o.notes,
    order_status: o.status,
    payments: (pays.data?.items || []).map((p) => ({
      id: p.id,
      status: p.status,
      amount: p.amount,
      notes: p.notes,
    })),
  });
}

const captured = hits.some((h) =>
  h.payments.some((p) => ["captured", "authorized"].includes(String(p.status).toLowerCase()))
);

let sibling = [];
if (pool) {
  sibling = (
    await pool.query(
      `SELECT o.id, o.display_id, o.created_at,
              o.metadata->>'razorpay_payment_status' as rzp_status,
              o.metadata->>'razorpay_payment_id' as rzp_pay
       FROM "order" o
       JOIN customer c ON c.id = o.customer_id
       WHERE c.email ILIKE 'anushka%'
         AND o.created_at > NOW() - INTERVAL '1 day'
         AND COALESCE(o.is_draft_order, false) = false
       ORDER BY o.created_at DESC
       LIMIT 10`
    )
  ).rows;
  await pool.end();
}

const verdict = captured
  ? "CAPTURED_ORPHAN — needs ops recover/refund"
  : hits.length
    ? "RZP_ORDER_FOUND_BUT_NOT_CAPTURED"
    : "NO_RZP_HIT — unpaid cancel or receipt outside last 100 payments; check sibling placed orders";

console.log(
  JSON.stringify(
    {
      target: TARGET,
      medusa_exists: Boolean(medusa.rows[0]),
      razorpay_hits: hits,
      scanned_payments: payments.length,
      anushka_recent_placed: sibling,
      verdict,
    },
    null,
    2
  )
);
