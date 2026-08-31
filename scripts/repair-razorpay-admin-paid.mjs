/**
 * Repair Razorpay orders that have capture metadata/transactions but missing
 * Medusa payment module rows (Admin shows "Not paid").
 *
 * Usage:
 *   node scripts/repair-razorpay-admin-paid.mjs --dry-run
 *   node scripts/repair-razorpay-admin-paid.mjs --orderNo=846
 *   node scripts/repair-razorpay-admin-paid.mjs --apply --limit=20
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const NEXT = process.env.NEXT_BASE_URL || "http://localhost:3000";

function loadEnv() {
  for (const rel of [".env", ".env.local", "my-medusa-store/.env"]) {
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

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return true;
  return fallback;
}

loadEnv();
const db = process.env.DATABASE_URL;
if (!db) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const dryRun = Boolean(arg("dry-run", !arg("apply", false)));
const apply = Boolean(arg("apply", false)) || !dryRun;
const orderNo = arg("orderNo");
const orderIdArg = arg("orderId");
const limit = Number(arg("limit", "20")) || 20;

const pool = new pg.Pool({
  connectionString: db,
  ssl: db.includes("amazonaws.com") ? { rejectUnauthorized: false } : undefined,
});

async function paymentRowCount(orderId) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM payment p
     INNER JOIN order_payment_collection opc
       ON opc.payment_collection_id = p.payment_collection_id
     WHERE opc.order_id = $1
       AND opc.deleted_at IS NULL
       AND p.deleted_at IS NULL
       AND p.captured_at IS NOT NULL`,
    [orderId]
  );
  return Number(res.rows[0]?.cnt || 0);
}

async function findCandidates() {
  if (orderIdArg || orderNo) {
    const q = orderIdArg
      ? await pool.query(`SELECT id, display_id, metadata FROM "order" WHERE id = $1`, [
          orderIdArg,
        ])
      : await pool.query(
          `SELECT id, display_id, metadata FROM "order" WHERE display_id = $1`,
          [Number(orderNo)]
        );
    return q.rows;
  }

  const res = await pool.query(
    `SELECT id, display_id, metadata
     FROM "order"
     WHERE deleted_at IS NULL
       AND metadata->>'razorpay_payment_status' = 'captured'
       AND COALESCE(metadata->>'razorpay_payment_id', '') <> ''
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(limit * 5, 50)]
  );
  return res.rows;
}

async function reconcile(orderId) {
  const res = await fetch(`${NEXT}/api/checkout/razorpay/reconcile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ medusaOrderId: orderId }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const rows = await findCandidates();
const report = [];

for (const row of rows) {
  const meta = row.metadata || {};
  const pays = await paymentRowCount(row.id);
  const needs =
    pays === 0 &&
    meta.razorpay_payment_status === "captured" &&
    typeof meta.razorpay_payment_id === "string";

  if (!needs) continue;

  const entry = {
    id: row.id,
    display_id: row.display_id,
    razorpay_payment_id: meta.razorpay_payment_id,
    payments_before: pays,
  };

  if (!apply || dryRun) {
    entry.action = "dry-run-would-reconcile";
    report.push(entry);
    if (report.length >= limit) break;
    continue;
  }

  const result = await reconcile(row.id);
  entry.action = "reconcile";
  entry.status = result.status;
  entry.result = result.data;
  entry.payments_after = await paymentRowCount(row.id);
  report.push(entry);
  if (report.length >= limit) break;
}

console.log(
  JSON.stringify(
    {
      mode: apply && !dryRun ? "apply" : "dry-run",
      next: NEXT,
      repaired: report,
      count: report.length,
    },
    null,
    2
  )
);

await pool.end();

const failed = report.filter(
  (r) => r.action === "reconcile" && (r.status >= 400 || !r.payments_after)
);
if (failed.length) process.exit(1);
