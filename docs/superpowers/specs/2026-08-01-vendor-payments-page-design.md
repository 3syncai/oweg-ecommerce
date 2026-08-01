# Vendor Payments Page Design

**Date:** 2026-08-01  
**Status:** Approved (pending final spec review)  
**Apps:** `vendor-portal`, `my-medusa-store`

## Goal

Replace the current vendor **Payout** page (`/payout`) with a **Payments** page that matches the vendor presentation slide: five summary cards plus a settlement transaction table.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Scope | Full replace of unlock/balance UI (no hybrid) |
| Route | Keep `/payout` |
| Nav label | Rename **Payout** → **Payments** |
| Pending Payment | `available_balance` (ready to withdraw) |
| Total Sale | Delivered **today** only (sales − returns for those deliveries) |
| Logistic Fee / Taxes | Show `₹0` for now (no backend calc yet) |
| Order Id click | Navigate to vendor orders page focused on that order |

## Out of scope

- Real logistic fee / tax calculation
- Withdrawal request flow UI
- Unlock countdown timers and “returned orders” list blocks
- Admin payments screens
- Export / CSV

## UI

### Header

- Title: **Payments**
- Optional Refresh control (reuse existing sync/summary refresh behavior)
- Remove the old subtitle that emphasized available / unlocking / cancelled totals as the primary story

### Summary cards (row of 5)

1. **Total Sale (Sales − Returns)** — net of today’s delivered sales minus today’s delivered returns (gross basis as defined below)
2. **Commission (₹)** — commission for those same today delivery rows
3. **Logistic Fee (₹)** — always `₹0` in this iteration
4. **Pending Payment** — current `available_balance`
5. **Withdrawn** — current `total_withdrawn`

Visual direction: slide-like bordered metric cards; keep existing OWEG green accents / portal tokens (do not introduce a purple theme). Prefer a clean 5-column row on desktop and wrap on mobile.

### Settlement table

| Column | Source / behavior |
| --- | --- |
| Product Name | Primary product title from order line items for the earning’s order |
| Order Id | Display id (`#123`); underlined link → `/orders` with order focus query |
| Type | `Sales` (green) or `Return` (red) |
| Order Amount (₹) | Gross; green for sales, red negative for returns |
| Commission (₹) | Deduction; shown in red (e.g. `-18.30`) |
| Logistic Fee (₹) | `₹0` |
| Taxes (₹) | `₹0` |
| Settlement Amount (₹) | Net credit for sales (green); for returns show `₹0` or negative reversal consistently with earnings status |

Footer note: *Vendors can click on order id to get full report of the particular settlement amount.*

Styling cues from the slide (adapt to portal): blue table header, light zebra rows, sales/settlement green, returns/deductions red.

## Data model / API

### Existing foundation

- Earnings live in `vendor_earnings_log` (`UNLOCKING` / `CREDITED` / `PAID` / `REVERSED`)
- Summary helpers already expose balances and recent rows via `/vendor/payouts/summary`
- Product titles are **not** on earnings rows today — join order items

### New (or extended) endpoint

`GET /vendor/payouts/payments` (preferred dedicated route)

Response shape:

```ts
type VendorPaymentsResponse = {
  cards: {
    total_sale: number          // today's delivered sales gross − today's return gross
    commission: number          // today's commission on those sales (and return handling as below)
    logistic_fee: number        // 0
    pending_payment: number     // available_balance
    withdrawn: number           // total_withdrawn
  }
  settlements: Array<{
    id: string
    order_id: string
    order_display_id: string | null
    product_name: string
    type: "sales" | "return"
    order_amount: number
    commission: number
    logistic_fee: number        // 0
    taxes: number               // 0
    settlement_amount: number
  }>
  timezone: string              // e.g. "Asia/Kolkata"
  as_of: string                 // ISO timestamp
}
```

### “Today” definition

- Calendar day in `Asia/Kolkata` based on `delivered_at` on `vendor_earnings_log`
- Include rows whose status is one of: `UNLOCKING`, `CREDITED`, `PAID`, `REVERSED` **and** `delivered_at` falls in today’s IST window
- **Total Sale** = sum(gross sales) − sum(gross of reversed/return rows) for that today set
- **Commission card** = sum(commission_amount) for today’s sales rows (returns do not add commission credit)

### Settlement rows

- One row per earning log for the today window when possible
- Product name: first vendor line item title on the order; if multiple products, use first + `+N more` or the dominant line — prefer first non-empty title
- If product title cannot be resolved, fall back to `Order #{display_id}`
- Returns / `REVERSED`: Type = Return; order amount negative; settlement `0` or negative per current “no credit” business rule (`₹0` preferred to match current portal copy)

### Frontend data loading

- Primary: `vendorPayoutsApi.payments()` → new endpoint
- Fallback: if 404, derive a degraded view from existing summary (cards without today accuracy / table from recent lists) **only if cheap**; otherwise show clear error asking for Medusa redeploy

## Frontend changes

- Rewrite `vendor-portal/app/payout/page.tsx` to cards + table layout
- Update `VendorShell` nav label **Payout** → **Payments**
- Extend `vendor-portal/lib/api/client.ts` with types + `payments()` helper
- Remove unused unlock timer / guide usage from this page (components may remain for orders list if used elsewhere)

## Backend changes

- Add `my-medusa-store/src/api/vendor/payouts/payments/route.ts`
- Add query helpers in `vendor-earnings.ts` (or colocated lib) for today settlements + card aggregates
- Join order / line item title via existing DB patterns used by vendor orders APIs
- CORS + `requireApprovedVendor` consistent with other `/vendor/payouts/*` routes

## Success criteria

1. `/payout` shows five cards matching the slide semantics
2. Total Sale / Commission reflect **today’s deliveries** only
3. Pending = available balance; Withdrawn = processed payouts; Logistic = 0
4. Table lists today’s settlement rows with product name + clickable order id
5. Sales vs Return color coding matches the slide intent
6. Old unlock / returned / guide blocks are gone from this page
7. Medusa + vendor-portal build succeed

## Non-goals / follow-ups

- Real logistic + tax columns
- Multi-day history filters / pagination beyond today (can add later)
- Order settlement detail modal (order page is enough for v1)
