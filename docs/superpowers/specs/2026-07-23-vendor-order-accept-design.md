# Vendor Orders — Accept Flow + Figma Layout (Phase 1)

**Date:** 2026-07-23  
**Status:** Approved for implementation  
**Scope:** Vendor portal Orders page UI + vendor Accept API (accept only)

---

## Goal

Replace the current vendor Orders page with a Figma-structured orders workspace where **new** orders require the vendor to **Accept** before later fulfilment steps. Shipping, reject, and SLA flows are out of scope for this phase.

## Decisions (locked)

| Topic | Decision |
|---|---|
| After Accept | Accept only — no ship UI yet |
| Reject | Not in phase 1 |
| Historical orders | No Accept button; show from current fulfillment status |
| New orders | Show in **Need acceptance** until Accept |
| UI structure | Match Figma (tabs, filter bar, table columns) |
| Colors | Keep existing OWEG vendor portal **green + white** (not Figma navy/blue) |
| Shell | Keep current `VendorShell` sidebar |

---

## UX

### Page chrome

- Title: **Orders**
- Subtitle: short line e.g. “Accept new orders and track fulfilment.”
- Keep existing top shell (notifications, etc.)

### Status pills (with counts)

1. All  
2. Need acceptance  
3. Ready to ship  
4. Shipped  
5. Delivered  
6. Cancelled  

Active pill uses existing green accent (not Figma blue).

### Filter bar

- Search: order #, customer email/name, or item title / SKU  
- Order status dropdown (mirrors pill filter)  
- Date range: Last 7 days / Last 30 days / All time (default Last 30 days or All for small catalogs)  
- Export CSV of the **currently filtered** rows  

### Table columns

| Column | Content |
|---|---|
| Order | Display id (e.g. `#685`), link-styled with green accent |
| Customer | Email or name |
| Item | Primary vendor item title + `x qty` (if multiple: first + “+N more”) |
| Status | Vendor-facing label (Need acceptance, Ready to ship, …) |
| Shipping | `—` in phase 1 (placeholder for later) |
| Total | INR formatted vendor-visible order/item total as today |
| Actions | **Accept** button only when status is Need acceptance |

Remove the current payout-timer-heavy layout from the main list (payout stays on Payout page / Messages). Optional compact payout hint is not required in phase 1.

---

## Status mapping

### Vendor acceptance state (per vendor, on order)

Stored on order metadata (Approach 1):

```ts
metadata.vendor_acceptance = {
  [vendorId]: {
    status: "pending" | "accepted",
    accepted_at?: string // ISO
  }
}
```

- **New orders** (after feature ships): when a vendor-visible order is first returned/created for that vendor, ensure `status: "pending"` exists for that `vendorId`.
- **Legacy orders** (no `vendor_acceptance[vendorId]` key): treat as **not requiring accept**. Tab from fulfillment only.

### Tab rules

| Tab | Rule |
|---|---|
| Need acceptance | Has `vendor_acceptance[vendorId].status === "pending"` |
| Ready to ship | `accepted` AND not shipped/delivered/cancelled |
| Shipped | Fulfillment shipped (existing signals) |
| Delivered | Fulfillment delivered |
| Cancelled | Order/items cancelled (existing signals) |
| All | All vendor-visible orders |

If a legacy delivered order has no acceptance key → **Delivered** tab only (never Need acceptance).

---

## Backend

### Extend `GET /vendor/orders`

Each order in the response includes:

```ts
{
  // existing fields…
  vendor_acceptance: {
    status: "pending" | "accepted" | "not_required",
    accepted_at: string | null
  },
  vendor_status: "need_acceptance" | "ready_to_ship" | "shipped" | "delivered" | "cancelled"
}
```

`not_required` = legacy / no acceptance record.

### `POST /vendor/orders/:id/accept`

- Auth: approved vendor  
- Validates order is visible to this vendor  
- Requires pending acceptance (or creates pending only for new-order path — accept fails if `not_required`)  
- Sets `metadata.vendor_acceptance[vendorId] = { status: "accepted", accepted_at: now }`  
- Returns updated order + acceptance payload  
- Idempotent: already accepted → 200 with current state  

### Marking new orders pending

Prefer a single place when vendor orders are assembled or when order is placed with vendor items:

- On list/get: if order is “new” relative to feature and has no key, **do not** auto-write pending for old orders.  
- Use a feature flag timestamp or explicit write at order-placement / first visibility for orders created after deploy.  
- Practical rule for phase 1: **when order is created** (subscriber or existing order-placed path) and items belong to a vendor, set `vendor_acceptance[vendorId].status = "pending"`. Orders without this key remain legacy forever.

---

## Frontend

### Files

- Replace UI in `vendor-portal/app/orders/page.tsx` (Figma structure, green/white tokens)  
- Extend `vendorOrdersApi` with `accept(id)`  
- Reuse existing currency/date helpers and shell  

### Accept UX

- Button on row (and optionally confirm)  
- Loading state per row  
- On success: toast / inline success; row moves to Ready to ship  
- On error: show message  

### Export CSV

Client-side CSV from filtered list columns (Order, Customer, Item, Status, Shipping, Total, Date).

---

## Out of scope (later)

- Reject / cancel from vendor  
- Shipping method / Shiprocket from this page  
- Ready-to-ship actions beyond status label  
- Full portal rebrand to Figma navy sidebar  
- Admin UI for acceptance oversight (optional later)

---

## Success criteria

1. New vendor order appears under **Need acceptance** with **Accept**.  
2. Accept moves it to **Ready to ship**; no Accept on legacy delivered/shipped orders.  
3. Page layout matches Figma structure; colors remain green/white OWEG.  
4. Search, status filter, date range, and CSV export work on the list.  
5. `POST /vendor/orders/:id/accept` is authenticated and vendor-scoped.
