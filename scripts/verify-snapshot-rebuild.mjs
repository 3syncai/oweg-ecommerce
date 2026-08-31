/**
 * Focused: mint RZP → snapshot → DELETE parent → confirm recover.
 * Run: node scripts/verify-snapshot-rebuild.mjs
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!(k in env) || env[k] === "") env[k] = v;
    }
  }
  return env;
}
const env = loadEnv();
const MEDUSA = (env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
const NEXT = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_KEY = env.MEDUSA_ADMIN_API_KEY || "";
const RZP_SECRET = env.RAZORPAY_KEY_SECRET || "";
const DATABASE_URL = env.DATABASE_URL || "";
const REGION_ID = "reg_01KA5SZQ3ZS11Y7HSYJQG16K0K";
const SHIPPING_OPTION_ID = "so_01KBR9WKS1KWPFG3XW23WCG0N7";
const VARIANT_ID = "variant_01KSW69ZV8WJ53RD618XH8TJVR";

function sign(orderId, paymentId) {
  return crypto.createHmac("sha256", RZP_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

async function admin(pathname, init = {}) {
  const res = await fetch(`${MEDUSA}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Basic ${ADMIN_KEY}`,
      "x-medusa-access-token": ADMIN_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL required");
  const cust = await admin("/admin/customers?q=qa-payment-matrix@example.com&limit=1");
  const customer = cust.data?.customers?.[0];
  if (!customer?.id) throw new Error("QA customer missing");

  const address = {
    first_name: "Snap",
    last_name: "Rebuild",
    phone: "9999999999",
    address_1: "1 Test St",
    city: "Mumbai",
    province: "MH",
    postal_code: "400001",
    country_code: "in",
  };
  const created = await admin("/admin/draft-orders", {
    method: "POST",
    body: JSON.stringify({
      region_id: REGION_ID,
      email: customer.email,
      customer_id: customer.id,
      currency_code: "inr",
      billing_address: address,
      shipping_address: address,
      items: [{ variant_id: VARIANT_ID, quantity: 1, unit_price: 100 }],
      shipping_methods: [{ shipping_option_id: SHIPPING_OPTION_ID, amount: 0, name: "QA Free" }],
      metadata: { payment_method: "razorpay", checkout_status: "awaiting_payment", qa: "snap_rebuild" },
    }),
  });
  if (!created.ok) throw new Error(`draft create ${created.status} ${JSON.stringify(created.data)}`);
  const draft = created.data?.draft_order || created.data?.order || created.data;
  console.log("draft", draft.id);

  const mint = await fetch(`${NEXT}/api/create-razorpay-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ medusaOrderId: draft.id, amount: 100 }),
  });
  const mintData = await mint.json();
  console.log("mint", mint.status, mintData);
  if (!mint.ok) throw new Error("mint failed");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("amazonaws.com") ? { rejectUnauthorized: false } : undefined,
  });
  const snap = await pool.query(
    `SELECT medusa_order_id, razorpay_order_id, payload FROM checkout_payment_snapshot WHERE medusa_order_id=$1`,
    [draft.id]
  );
  console.log("snapshot rows", snap.rows.length, snap.rows[0] ? Object.keys(snap.rows[0].payload || {}) : null);
  if (!snap.rows.length) throw new Error("no snapshot after mint");

  await admin(`/admin/draft-orders/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
  console.log("deleted parent");

  const payId = `pay_qa_snap_${Date.now()}`;
  const rzpId = mintData.orderId;
  const body = {
    medusaOrderId: draft.id,
    razorpay_order_id: rzpId,
    razorpay_payment_id: payId,
    razorpay_signature: sign(rzpId, payId),
    amount_minor: 10000,
    currency: "INR",
  };

  const concurrent = process.argv.includes("--concurrent");
  if (concurrent) {
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        fetch(`${NEXT}/api/checkout/razorpay/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (r) => ({ status: r.status, data: await r.json() }))
      )
    );
    console.log("concurrent confirms", results);
    const ids = [
      ...new Set(
        results
          .filter((r) => r.status >= 200 && r.status < 300)
          .map((r) => r.data?.orderId || r.data?.medusaOrderId)
          .filter(Boolean)
      ),
    ];
    const byPay = await pool.query(
      `SELECT id FROM "order" WHERE deleted_at IS NULL AND metadata->>'razorpay_payment_id' = $1`,
      [payId]
    );
    console.log("unique response ids", ids, "db rows", byPay.rows.length);
    await pool.end();
    if (ids.length !== 1 || byPay.rows.length !== 1) process.exit(1);
    console.log("PASS concurrent → 1 order", ids[0]);
    return;
  }

  const conf = await fetch(`${NEXT}/api/checkout/razorpay/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const confData = await conf.json();
  console.log("confirm", conf.status, confData);
  await pool.end();
  if (!conf.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
