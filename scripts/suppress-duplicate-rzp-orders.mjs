/**
 * Suppress duplicate placed orders that share one razorpay_payment_id.
 * Keeps earliest (MIN created_at); stamps checkout_duplicate_suppressed on the rest.
 *
 * Usage:
 *   node scripts/suppress-duplicate-rzp-orders.mjs
 *   node scripts/suppress-duplicate-rzp-orders.mjs --display-ids=1059,1060,1061
 */
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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in env) || env[k] === "") env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || "";
const ADMIN_KEY = env.MEDUSA_ADMIN_API_KEY || "";
const MEDUSA = (env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

const displayArg = process.argv.find((a) => a.startsWith("--display-ids="));
const displayIds = displayArg
  ? displayArg
      .slice("--display-ids=".length)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  : [1059, 1060, 1061];

async function patchMetadata(orderId, metadata) {
  const res = await fetch(`${MEDUSA}/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${ADMIN_KEY}`,
      "x-medusa-access-token": ADMIN_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ metadata }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("amazonaws.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const { rows } = await pool.query(
    `SELECT id, display_id, email, created_at,
            metadata->>'razorpay_payment_id' AS pay_id,
            metadata->>'razorpay_order_id' AS rzp_order,
            metadata->>'original_medusa_order_id' AS original_id,
            metadata->>'checkout_duplicate_suppressed' AS already_suppressed
     FROM "order"
     WHERE deleted_at IS NULL
       AND display_id = ANY($1::int[])
     ORDER BY created_at ASC, display_id ASC`,
    [displayIds]
  );

  console.log("Found orders:", rows);

  const byPay = new Map();
  for (const row of rows) {
    const key = row.pay_id || `no_pay:${row.id}`;
    if (!byPay.has(key)) byPay.set(key, []);
    byPay.get(key).push(row);
  }

  for (const [payId, group] of byPay) {
    if (group.length < 2) {
      console.log(`skip ${payId}: single order`);
      continue;
    }
    const keep = group[0];
    const drop = group.slice(1);
    console.log(
      `pay ${payId}: keep #${keep.display_id} (${keep.id}); suppress ${drop
        .map((d) => `#${d.display_id}`)
        .join(", ")}`
    );

    // Ensure claim points at kept order
    await pool.query(`
      CREATE TABLE IF NOT EXISTS razorpay_capture_claim (
        razorpay_payment_id TEXT PRIMARY KEY,
        medusa_order_id TEXT NULL,
        status TEXT NOT NULL DEFAULT 'claimed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    if (payId && !payId.startsWith("no_pay:")) {
      await pool.query(
        `INSERT INTO razorpay_capture_claim (razorpay_payment_id, medusa_order_id, status, created_at, updated_at)
         VALUES ($1, $2, 'placed', NOW(), NOW())
         ON CONFLICT (razorpay_payment_id) DO UPDATE SET
           medusa_order_id = EXCLUDED.medusa_order_id,
           status = 'placed',
           updated_at = NOW()`,
        [payId, keep.id]
      );
    }

    for (const d of drop) {
      const patch = await patchMetadata(d.id, {
        checkout_duplicate_suppressed: true,
        checkout_duplicate_of: keep.id,
        checkout_duplicate_of_display_id: keep.display_id,
        checkout_status: "duplicate_suppressed",
      });
      console.log(`suppress #${d.display_id}`, patch.ok ? "OK" : patch);
    }
  }

  await pool.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
