/**
 * Automated payment-retry lifecycle QA (local).
 * Covers server-side equivalents of checklist cases 2/3/4/7.
 *
 * Run: node scripts/verify-payment-retry-lifecycle.mjs
 * Requires: Medusa :9000, Next :3000, Razorpay + Medusa keys in .env
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

function loadEnv() {
  const env = { ...process.env };
  if (!fs.existsSync(ENV_PATH)) throw new Error(`.env missing at ${ENV_PATH}`);
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
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
  return env;
}

const env = loadEnv();
const MEDUSA = (env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
const NEXT = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_KEY = env.MEDUSA_ADMIN_API_KEY || "";
const RZP_KEY = env.RAZORPAY_KEY_ID || "";
const RZP_SECRET = env.RAZORPAY_KEY_SECRET || "";
const WH_SECRET = env.RAZORPAY_WEBHOOK_SECRET || "";

const REGION_ID = "reg_01KA5SZQ3ZS11Y7HSYJQG16K0K";
const SHIPPING_OPTION_ID = "so_01KBR9WKS1KWPFG3XW23WCG0N7";
const VARIANT_ID = "variant_01KSW69ZV8WJ53RD618XH8TJVR";
/** Fixed test amount in INR rupees (Razorpay expects paise). */
const AMOUNT_RUPEES = 100;

const results = [];

function assert(cond, message) {
  if (!cond) {
    console.error("FAIL:", message);
    throw new Error(message);
  }
}

function log(step, detail) {
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ""}`);
}

function adminHeaders() {
  return {
    Authorization: `Basic ${ADMIN_KEY}`,
    "x-medusa-access-token": ADMIN_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function admin(pathname, init = {}) {
  const res = await fetch(`${MEDUSA}${pathname}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function extractDraft(data) {
  if (!data || typeof data !== "object") return null;
  return data.draft_order || data.order || data;
}

const QA_CUSTOMER_EMAIL = "qa-payment-matrix@example.com";

async function getQaCustomer() {
  const search = await admin(
    `/admin/customers?q=${encodeURIComponent(QA_CUSTOMER_EMAIL)}&limit=5`
  );
  if (search.ok) {
    const found = (search.data?.customers || []).find(
      (c) => String(c.email || "").toLowerCase() === QA_CUSTOMER_EMAIL
    );
    if (found?.id) return found;
  }

  const created = await admin("/admin/customers", {
    method: "POST",
    body: JSON.stringify({
      email: QA_CUSTOMER_EMAIL,
      first_name: "QA",
      last_name: "PaymentMatrix",
      phone: "9000000001",
    }),
  });
  if (created.ok) {
    const customer = created.data?.customer || created.data;
    assert(customer?.id, "created QA customer missing id");
    return customer;
  }

  const again = await admin(
    `/admin/customers?q=${encodeURIComponent(QA_CUSTOMER_EMAIL)}&limit=5`
  );
  const foundAgain = (again.data?.customers || []).find(
    (c) => String(c.email || "").toLowerCase() === QA_CUSTOMER_EMAIL
  );
  assert(foundAgain?.id, `unable to create/find QA customer: ${JSON.stringify(created.data)}`);
  return foundAgain;
}

async function createQaDraft(tag, customer) {
  const address = {
    first_name: customer.first_name || "QA",
    last_name: customer.last_name || "Retry",
    phone: customer.phone || "9999999999",
    address_1: "1 Test Street",
    city: "Mumbai",
    province: "MH",
    postal_code: "400001",
    country_code: "in",
  };
  const payload = {
    region_id: REGION_ID,
    email: customer.email,
    customer_id: customer.id,
    currency_code: "inr",
    billing_address: address,
    shipping_address: address,
    items: [{ variant_id: VARIANT_ID, quantity: 1, unit_price: AMOUNT_RUPEES }],
    shipping_methods: [
      {
        shipping_option_id: SHIPPING_OPTION_ID,
        amount: 0,
        name: "QA Free Shipping",
      },
    ],
    metadata: {
      payment_method: "razorpay",
      checkout_status: "awaiting_payment",
      razorpay_payment_status: "created",
      qa_payment_retry: tag,
    },
  };

  const res = await admin("/admin/draft-orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  assert(res.ok, `create draft failed (${res.status}): ${JSON.stringify(res.data)}`);
  const draft = extractDraft(res.data);
  assert(draft?.id, "draft missing id");
  return draft;
}

async function getDraft(id) {
  const res = await admin(`/admin/draft-orders/${encodeURIComponent(id)}`);
  if (!res.ok) return { ok: false, status: res.status, draft: null };
  return { ok: true, status: res.status, draft: extractDraft(res.data) };
}

async function updateDraftMetadata(id, metadata) {
  const res = await admin(`/admin/draft-orders/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ metadata }),
  });
  // Medusa v2 may use POST or PATCH depending on version — try PATCH fallback
  if (!res.ok) {
    const res2 = await admin(`/admin/draft-orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ metadata }),
    });
    assert(res2.ok, `update metadata failed (${res.status}/${res2.status}): ${JSON.stringify(res2.data)}`);
    return extractDraft(res2.data);
  }
  return extractDraft(res.data);
}

async function deleteDraft(id) {
  await admin(`/admin/draft-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function createRazorpayOrder(receipt) {
  const auth = Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    amount: String(Math.round(AMOUNT_RUPEES * 100)),
    currency: "INR",
    receipt: String(receipt).slice(0, 40),
    "notes[medusa_order_id]": receipt,
  });
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  assert(res.ok && data.id, `Razorpay create order failed: ${JSON.stringify(data)}`);
  return data;
}

function signWebhookBody(rawBody) {
  return crypto.createHmac("sha256", WH_SECRET).update(rawBody).digest("hex");
}

async function postPaymentFailedWebhook({ medusaOrderId, razorpayOrderId, amountPaise }) {
  const payload = {
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: `pay_qa_${Date.now()}`,
          order_id: razorpayOrderId,
          amount: amountPaise,
          currency: "INR",
          status: "failed",
          notes: { medusa_order_id: medusaOrderId },
        },
      },
      order: {
        entity: {
          id: razorpayOrderId,
          amount: amountPaise,
          currency: "INR",
          receipt: medusaOrderId,
          notes: { medusa_order_id: medusaOrderId },
        },
      },
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = signWebhookBody(rawBody);
  const res = await fetch(`${NEXT}/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature,
    },
    body: rawBody,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function postTerminalPaymentFailed(medusaOrderId) {
  const res = await fetch(`${NEXT}/api/checkout/payment-failed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ medusaOrderId }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function createRazorpayOrderViaApi(medusaOrderId) {
  const res = await fetch(`${NEXT}/api/create-razorpay-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ medusaOrderId, amount: AMOUNT_RUPEES }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function ensureServices() {
  for (const [name, url] of [
    ["Medusa", `${MEDUSA}/health`],
    ["Next", NEXT],
  ]) {
    try {
      const r = await fetch(url);
      assert(r.ok || r.status < 500, `${name} not healthy at ${url} (${r.status})`);
      log(`${name} reachable`, url);
    } catch (e) {
      throw new Error(`${name} unreachable at ${url}: ${e.message}`);
    }
  }
  assert(ADMIN_KEY, "MEDUSA_ADMIN_API_KEY missing");
  assert(RZP_KEY && RZP_SECRET, "Razorpay keys missing");
  assert(WH_SECRET, "RAZORPAY_WEBHOOK_SECRET missing");
}

async function main() {
  console.log("\n=== Payment retry lifecycle QA ===\n");
  await ensureServices();

  const created = [];
  try {
    const customer = await getQaCustomer();
    log("Using customer", `${customer.id} (${customer.email})`);

    // --- Case 7: webhook soft-fail keeps draft ---
    const draftA = await createQaDraft("case7", customer);
    created.push(draftA.id);
    log("Created draft A", draftA.id);

    const rzpA = await createRazorpayOrder(draftA.id);
    log("Created Razorpay order A", rzpA.id);

    await updateDraftMetadata(draftA.id, {
      ...(draftA.metadata || {}),
      payment_method: "razorpay",
      checkout_status: "awaiting_payment",
      razorpay_payment_status: "created",
      razorpay_order_id: rzpA.id,
      qa_payment_retry: "case7",
    });

    const wh = await postPaymentFailedWebhook({
      medusaOrderId: draftA.id,
      razorpayOrderId: rzpA.id,
      amountPaise: Math.round(AMOUNT_RUPEES * 100),
    });
    assert(wh.ok, `webhook payment.failed failed (${wh.status}): ${JSON.stringify(wh.data)}`);
    assert(wh.data?.soft_failed === true || wh.data?.ok === true, `expected soft_failed response: ${JSON.stringify(wh.data)}`);
    log("Webhook payment.failed soft-stamped", JSON.stringify(wh.data));

    const afterSoft = await getDraft(draftA.id);
    assert(afterSoft.ok && afterSoft.draft?.id, "draft A deleted after soft fail — regression");
    const softStatus = String(afterSoft.draft.metadata?.razorpay_payment_status || "").toLowerCase();
    assert(
      softStatus === "attempted_failed",
      `expected attempted_failed, got ${softStatus}`
    );
    log("Case 7 pass", `status=${softStatus}, draft retained`);
    results.push({ case: 7, result: "PASS", notes: `soft_failed; ${softStatus}; draft ${draftA.id}` });

    // Cases 2/3 share the same server lifecycle (in-modal retry after soft fail).
    const reuseSoft = await createRazorpayOrderViaApi(draftA.id);
    assert(reuseSoft.ok, `create-razorpay-order after soft fail: ${JSON.stringify(reuseSoft.data)}`);
    assert(
      reuseSoft.data.orderId === rzpA.id,
      `soft-fail should reuse RZP order; got ${reuseSoft.data.orderId} vs ${rzpA.id}`
    );
    log("Cases 2/3 server-equivalent pass", "soft-fail session reuses same RZP order (in-modal retry)");
    results.push({
      case: 2,
      result: "PASS (server)",
      notes: "same lifecycle as soft-fail + RZP reuse; UI method not exercised",
    });
    results.push({
      case: 3,
      result: "PASS (server)",
      notes: "same lifecycle as soft-fail + RZP reuse; UI method switch not exercised",
    });

    // --- Case 4: terminal abandon deletes draft; next pay gets fresh ids ---
    const terminal = await postTerminalPaymentFailed(draftA.id);
    assert(terminal.ok, `payment-failed API failed: ${JSON.stringify(terminal.data)}`);
    log("Terminal payment-failed called", draftA.id);

    const afterTerminal = await getDraft(draftA.id);
    assert(!afterTerminal.ok || !afterTerminal.draft?.id, "draft A still exists after terminal fail");
    log("Case 4a pass", "draft deleted after dismiss/terminal cleanup");

    const draftB = await createQaDraft("case4-fresh", customer);
    created.push(draftB.id);
    const mint = await createRazorpayOrderViaApi(draftB.id);
    assert(mint.ok && mint.data.orderId, `fresh mint failed: ${JSON.stringify(mint.data)}`);
    assert(mint.data.orderId !== rzpA.id, "fresh Pay securely reused deleted session RZP id");
    log("Case 4b pass", `fresh draft ${draftB.id} → new RZP ${mint.data.orderId}`);
    results.push({
      case: 4,
      result: "PASS",
      notes: `terminal delete + fresh draft/RZP (${mint.data.orderId})`,
    });

    // --- Reuse guard: terminal-failed metadata must not reuse ---
    const draftC = await createQaDraft("reuse-guard", customer);
    created.push(draftC.id);
    const rzpC = await createRazorpayOrder(draftC.id);
    await updateDraftMetadata(draftC.id, {
      ...(draftC.metadata || {}),
      payment_method: "razorpay",
      checkout_status: "payment_failed",
      razorpay_payment_status: "failed",
      razorpay_order_id: rzpC.id,
      qa_payment_retry: "reuse-guard",
    });
    const refuse = await createRazorpayOrderViaApi(draftC.id);
    assert(refuse.ok && refuse.data.orderId, `reuse-guard create failed: ${JSON.stringify(refuse.data)}`);
    assert(
      refuse.data.orderId !== rzpC.id,
      `create-razorpay-order reused terminal-failed RZP ${rzpC.id}`
    );
    log("Reuse guard pass", `minted ${refuse.data.orderId} instead of ${rzpC.id}`);
    results.push({
      case: "reuse-guard",
      result: "PASS",
      notes: `refused ${rzpC.id}; minted ${refuse.data.orderId}`,
    });

    console.log("\n=== ALL ASSERTS PASSED ===\n");
    for (const r of results) {
      console.log(`  case ${r.case}: ${r.result} — ${r.notes}`);
    }
  } finally {
    for (const id of created) {
      try {
        await deleteDraft(id);
      } catch {
        /* best-effort */
      }
    }
  }

  // Persist machine-readable summary for checklist update
  const summaryPath = path.join(ROOT, "docs", "payment-retry-qa-last-run.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        host: { medusa: MEDUSA, next: NEXT },
        results,
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${summaryPath}`);
}

main().catch((err) => {
  console.error("\nQA SCRIPT FAILED:", err.message || err);
  process.exit(1);
});
