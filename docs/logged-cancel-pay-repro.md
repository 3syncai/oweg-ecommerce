# Logged cancel → pay repro (paid-orphan)

Use after snapshot-rebuild ships. Runtime: `C:\dev\oweg_ecom_module` only (`docs/runtime-path.md`).

## Goal

Prove cancel/switch → successful Razorpay capture never lands on `orphan_capture` when a mint-time snapshot exists; Admin + My Orders show a paid order.

## Steps (manual, with logs)

1. Start keep-warm from `C:\dev\oweg_ecom_module\oweg-ecommerce` (`npm run dev:warm`).
2. Open two terminals tailing:
   - Next: watch for `POST /api/create-razorpay-order`, `confirm`, `recover`, `persistSnapshot`, `tryRebuildFromSnapshot`, `orphan_capture`
   - Medusa: watch for `[DRAFT_HARD_DELETE]` and convert-to-order
3. As shopper: checkout → open Razorpay → **cancel** → switch method (or Pay again) → **complete** payment.
4. Capture the window of logs + final URL (`/order/success?...`).
5. Assert:
   - Success UI is Paid (not orphan copy)
   - Admin shows Captured with payment rows
   - My Orders lists the order

## Automated stand-in

Matrix case `snapshot-rebuild-after-parent-delete` simulates the failure mode (mint → hard DELETE parent → confirm rebuilds from `checkout_payment_snapshot`).

```bash
cd C:\dev\oweg_ecom_module\oweg-ecommerce
node scripts/verify-payment-matrix.mjs
```
