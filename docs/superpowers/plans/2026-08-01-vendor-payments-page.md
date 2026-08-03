# Vendor Payments Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vendor portal Payout page with a Payments UI (5 summary cards + settlement table for today’s deliveries) backed by a new Medusa payments endpoint.

**Architecture:** Add `getVendorPaymentsView()` in `vendor-earnings.ts` that aggregates today’s IST deliveries from `vendor_earnings_log` and joins product titles from `order_line_item`. Expose it via `GET /vendor/payouts/payments`. Rewrite `vendor-portal/app/payout/page.tsx` to consume that payload and match the approved slide layout; rename nav label to Payments.

**Tech Stack:** Medusa v2 custom API routes, `pg` Pool SQL, Next.js vendor portal (`@medusajs/ui` + Tailwind), existing `vendorPayoutsApi` client patterns.

## Global Constraints

- Full replace of unlock/balance/returned/guide UI on `/payout` (route stays `/payout`)
- Nav label: **Payments**
- Pending Payment = `available_balance`
- Total Sale = delivered **today** only (Asia/Kolkata calendar day on `delivered_at`), sales − returns
- Logistic Fee and Taxes columns/cards = `0` this iteration
- Keep OWEG green + white portal look (no purple theme)
- Order Id links to `/orders?order=<order_id>`

---

## File structure

| File | Responsibility |
| --- | --- |
| `my-medusa-store/src/lib/vendor-earnings.ts` | Add `getVendorPaymentsView()` + types |
| `my-medusa-store/src/api/vendor/payouts/payments/route.ts` | `GET`/`OPTIONS` for payments payload |
| `vendor-portal/lib/api/client.ts` | Types + `vendorPayoutsApi.payments()` |
| `vendor-portal/app/payout/page.tsx` | Full UI rewrite: cards + table |
| `vendor-portal/components/VendorShell.tsx` | Nav label Payout → Payments |
| `vendor-portal/app/orders/page.tsx` | Honor `?order=` to open/focus that order |

---

### Task 1: Backend payments view helper

**Files:**
- Modify: `my-medusa-store/src/lib/vendor-earnings.ts`
- Test: manual SQL/shape check via route in Task 2 (no separate Jest suite in this repo for earnings)

**Interfaces:**
- Consumes: existing `getVendorEarningsSummary`, `syncVendorEarningsStatuses`, `fetchTotalWithdrawn` (keep private or duplicate withdrawn query if private)
- Produces:

```ts
export type VendorPaymentSettlement = {
  id: string
  order_id: string
  order_display_id: string | null
  product_name: string
  type: "sales" | "return"
  order_amount: number
  commission: number
  logistic_fee: number
  taxes: number
  settlement_amount: number
}

export type VendorPaymentsView = {
  cards: {
    total_sale: number
    commission: number
    logistic_fee: number
    pending_payment: number
    withdrawn: number
  }
  settlements: VendorPaymentSettlement[]
  timezone: "Asia/Kolkata"
  as_of: string
}

export async function getVendorPaymentsView(
  vendorId: string,
  pool: Pool
): Promise<VendorPaymentsView>
```

- [ ] **Step 1: Add exported types** near the top of `vendor-earnings.ts` (after existing summary types).

- [ ] **Step 2: Implement `getVendorPaymentsView`**

Logic:
1. `await syncVendorEarningsStatuses(pool)`
2. Load summary via `getVendorEarningsSummary` for `pending_payment` (= `available_balance`) and `withdrawn` (= `total_withdrawn`)
3. Query today’s earnings (IST):

```sql
SELECT
  vel.id,
  vel.order_id,
  vel.order_display_id,
  vel.status,
  vel.gross_amount,
  vel.commission_amount,
  vel.net_amount,
  vel.delivered_at,
  (
    SELECT COALESCE(oli.title, 'Order #' || COALESCE(vel.order_display_id, LEFT(vel.order_id, 8)))
    FROM order_item oi
    JOIN order_line_item oli ON oi.item_id = oli.id
    LEFT JOIN product_variant pv ON oli.variant_id = pv.id
    LEFT JOIN product p ON COALESCE(oli.product_id, pv.product_id) = p.id
    WHERE oi.order_id = vel.order_id
      AND p.metadata->>'vendor_id' = $1
    ORDER BY oli.id
    LIMIT 1
  ) AS product_name
FROM vendor_earnings_log vel
WHERE vel.vendor_id = $1
  AND vel.delivered_at IS NOT NULL
  AND (vel.delivered_at AT TIME ZONE 'Asia/Kolkata')::date
      = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
ORDER BY vel.delivered_at DESC, vel.updated_at DESC
```

4. Map rows:
   - `status === 'REVERSED'` → `type: "return"`, `order_amount: -abs(gross)`, `commission: -abs(commission)` or show abs commission in red, `settlement_amount: 0`
   - else → `type: "sales"`, positive amounts, `settlement_amount: net_amount`
   - `logistic_fee: 0`, `taxes: 0`
   - `product_name`: use subquery result or fallback `Order #…`
5. Cards:
   - `total_sale` = sum(gross sales) − sum(gross returns) for today’s rows
   - `commission` = sum(commission_amount) for non-return today rows
   - `logistic_fee` = 0
   - `pending_payment` = summary.available_balance
   - `withdrawn` = summary.total_withdrawn
6. Return `{ cards, settlements, timezone: "Asia/Kolkata", as_of: new Date().toISOString() }`

- [ ] **Step 3: Sanity-check TypeScript**

Run: `cd my-medusa-store && npx tsc --noEmit -p . 2>&1 | head -40`  
Expected: no new errors in `vendor-earnings.ts` (ignore unrelated project noise if any).

- [ ] **Step 4: Commit**

```bash
git add my-medusa-store/src/lib/vendor-earnings.ts
git commit -m "Add vendor payments view helper for today’s settlements."
```

---

### Task 2: Payments API route

**Files:**
- Create: `my-medusa-store/src/api/vendor/payouts/payments/route.ts`

**Interfaces:**
- Consumes: `getVendorPaymentsView` from Task 1; `requireApprovedVendor` from `../../_lib/guards`
- Produces: `GET /vendor/payouts/payments` → `VendorPaymentsView` JSON body (fields at top level, not nested under `summary`)

- [ ] **Step 1: Create route file** mirroring `summary/route.ts` CORS + auth:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import { getVendorPaymentsView } from "../../../../lib/vendor-earnings"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const data = await getVendorPaymentsView(auth.vendor_id, pool)
    res.json(data)
  } catch (error: any) {
    console.error("[Vendor Payments] error:", error)
    res.status(500).json({
      message: "Failed to load payments",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}
```

- [ ] **Step 2: Smoke-test locally** (Medusa running)

Run:  
`curl -s -H "Authorization: Bearer $VENDOR_TOKEN" http://localhost:9000/vendor/payouts/payments | head -c 800`  
Expected: JSON with `cards` and `settlements` keys.

- [ ] **Step 3: Commit**

```bash
git add my-medusa-store/src/api/vendor/payouts/payments/route.ts
git commit -m "Expose GET /vendor/payouts/payments for vendor portal."
```

---

### Task 3: Portal API client

**Files:**
- Modify: `vendor-portal/lib/api/client.ts` (near `vendorPayoutsApi`)

**Interfaces:**
- Consumes: `apiRequest` / `payoutRequestWithFallback`
- Produces:

```ts
export type VendorPaymentsView = {
  cards: {
    total_sale: number
    commission: number
    logistic_fee: number
    pending_payment: number
    withdrawn: number
  }
  settlements: Array<{
    id: string
    order_id: string
    order_display_id: string | null
    product_name: string
    type: "sales" | "return"
    order_amount: number
    commission: number
    logistic_fee: number
    taxes: number
    settlement_amount: number
  }>
  timezone: string
  as_of: string
}

// on vendorPayoutsApi:
payments: () => Promise<VendorPaymentsView>
```

- [ ] **Step 1: Add `VendorPaymentsView` type** after `VendorEarningsSummary`.

- [ ] **Step 2: Add `payments` method**

```ts
payments: async () => {
  return apiRequest<VendorPaymentsView>("/vendor/payouts/payments")
},
```

Do **not** silently fall back to the old summary for cards (today accuracy matters). Page will show a clear error on 404.

- [ ] **Step 3: Commit**

```bash
git add vendor-portal/lib/api/client.ts
git commit -m "Add vendor payments API client types and helper."
```

---

### Task 4: Orders page honor `?order=`

**Files:**
- Modify: `vendor-portal/app/orders/page.tsx`

**Interfaces:**
- Consumes: `useSearchParams` from `next/navigation`
- Produces: when `order` query is present, open that order’s detail (existing modal/drawer) after list load

- [ ] **Step 1: Read search param**

```ts
const searchParams = useSearchParams()
const focusOrderId = searchParams.get("order")
```

- [ ] **Step 2: After orders load**, if `focusOrderId` matches an order, set selected order / open details the same way a row click does today.

- [ ] **Step 3: Manual check** — visit `/orders?order=<known_id>` and confirm detail opens.

- [ ] **Step 4: Commit**

```bash
git add vendor-portal/app/orders/page.tsx
git commit -m "Open vendor order details from ?order= query param."
```

---

### Task 5: Rewrite Payments page UI + nav label

**Files:**
- Modify: `vendor-portal/app/payout/page.tsx` (full rewrite)
- Modify: `vendor-portal/components/VendorShell.tsx` (nav label only)

**Interfaces:**
- Consumes: `vendorPayoutsApi.payments()` from Task 3
- Produces: Payments page matching spec

- [ ] **Step 1: Rename nav item** in `VendorShell.tsx`

Change label `"Payout"` → `"Payments"` (path stays `/payout`).

- [ ] **Step 2: Replace `payout/page.tsx` content**

Structure:
1. Load via `vendorPayoutsApi.payments()` (Refresh button re-fetches)
2. Header: **Payments** + Refresh
3. Grid of 5 cards:
   - Total Sale (Sales − Returns) → `cards.total_sale`
   - Commission → `cards.commission`
   - Logistic Fee → `cards.logistic_fee` (₹0)
   - Pending Payment → `cards.pending_payment`
   - Withdrawn → `cards.withdrawn`
4. Table with columns from spec; Type Sales/Return color; amounts green/red as specified
5. Order Id: `<Link href={\`/orders?order=${row.order_id}\`}>#{display}</Link>`
6. Footer note about clicking order id
7. Remove unlock timer, returned list, credited list, GuideCard from this page
8. Empty state: “No deliveries today” when `settlements.length === 0`
9. Format with `en-IN` INR currency helper

Card styling: bordered white cards in a responsive `grid-cols-2 lg:grid-cols-5` layout; table header use solid blue (`bg-blue-700 text-white`) with zebra rows to match the slide while staying readable in the portal.

- [ ] **Step 3: Manual UI check** at `http://localhost:4000/payout`

Expected: five cards, settlement table, sidebar says Payments, no unlock/returned/guide blocks.

- [ ] **Step 4: Commit**

```bash
git add vendor-portal/app/payout/page.tsx vendor-portal/components/VendorShell.tsx
git commit -m "Rebuild vendor payout page as Payments cards and settlement table."
```

---

### Task 6: Verification

**Files:** none (verification only)

- [ ] **Step 1: Backend build**

Run: `cd my-medusa-store && npm run build`  
Expected: Backend + frontend build completed successfully.

- [ ] **Step 2: Portal lint/build if available**

Run: `cd vendor-portal && npx tsc --noEmit 2>&1 | head -40`  
Expected: no errors in payout/orders/client files.

- [ ] **Step 3: Spec checklist**

Confirm against `docs/superpowers/specs/2026-08-01-vendor-payments-page-design.md`:
1. Five cards with correct semantics  
2. Today-only Total Sale / Commission  
3. Pending = available; Withdrawn = processed; Logistic = 0  
4. Table with product name + clickable order id  
5. Sales/Return color coding  
6. Old unlock/returned/guide gone  
7. Builds pass  

- [ ] **Step 4: Final commit only if verification fixes were needed**; otherwise done.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Full UI replace | Task 5 |
| Nav Payments | Task 5 |
| 5 cards + today sale | Tasks 1–2, 5 |
| Logistic/Taxes ₹0 | Tasks 1, 5 |
| Pending = available | Task 1 |
| Settlement table + colors | Task 5 |
| Order Id → order focus | Tasks 4–5 |
| New API | Tasks 1–2 |
| Client types | Task 3 |
| Builds succeed | Task 6 |

No placeholders remaining. Types aligned across Tasks 1–5 (`VendorPaymentsView` fields match).
