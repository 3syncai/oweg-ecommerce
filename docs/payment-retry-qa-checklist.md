# Payment retry QA checklist (staging / local)

## Automated runs

```bash
# Critical retry lifecycle only
node scripts/verify-payment-retry-lifecycle.mjs

# Full matrix (cases 1–24 server/automated)
node scripts/verify-payment-matrix.mjs
```

Last run: [`payment-retry-qa-last-run.json`](./payment-retry-qa-last-run.json)

| Field | Value |
|-------|--------|
| Suite | `verify-payment-matrix` |
| Ran at | 2026-08-31 (after concurrent snapshot-claim fix) |
| Host | Medusa `:9000` + Next `:3000` |
| Mode | Signed webhooks + live Razorpay test orders + Medusa drafts + confirm/COD APIs |
| QA customer | `qa-payment-matrix@example.com` (not real shoppers) |
| FAIL count | **0** |

## Critical regression

| # | Case | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 2 | Fail in modal → retry same method | Success | **PASS (server)** | Soft-fail reuses RZP order |
| 3 | Fail → switch netbanking/card | Success | **PASS (server)** | Same lifecycle; UI method not clicked |
| 4 | Fail → dismiss → Pay again &lt;3 min | Fresh draft/RZP | **PASS** | Terminal delete + new RZP |
| 7 | Webhook `payment.failed` then success | Draft retained | **PASS** | `attempted_failed`; draft kept |

## Full matrix

| # | Case | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1 | Happy path capture | Captured / placed | **PASS** | Confirm with valid HMAC signature |
| 5 | Fail → hard refresh → Pay | Fresh recoverable | **PASS** | Soft recoverable; new draft after terminal |
| 6 | `/order/failed` → Retry | `/checkout` no stale id | **PASS** | Page 200; Retry → `/checkout` |
| 8 | Network drop / double confirm | Idempotent | **PASS** | Double confirm 200/200 |
| 9 | COD place order | Placed | **PASS** | COD confirmed |
| 10 | Toggle COD ↔ online | Correct guards | **PASS** | Online→COD blocked; RZP mint on COD returns **400** `cod_checkout_no_razorpay` |
| 11 | Coins → fail → dismiss | Refunded / draft gone | **PASS** | Terminal cleanup deletes draft |
| 12 | OWEG10 → fail → dismiss | Reservation released | **PASS** | DB pending cleared |
| 13 | Double-click Pay securely | Same RZP id | **PASS** | Parallel create coalesced to one `orderId` |
| 14 | Buy-now fail + retry | Same lifecycle | **PASS** | Soft retain + terminal delete |
| 15 | Inventory after fail | Holds released | **PASS** | Draft deleted on terminal |
| 16 | Success “Confirming” | Recovers | **PASS** | Soft-fail then confirm |
| 16-poll-404 | Dead order id on success | Error UI; poll stops | **PASS** | Terminal `order_not_found`; anushka dead id browser-verified |
| admin-paid-confirm | Confirm creates Medusa payment rows | Admin Captured | **PASS** | Assert `payment` rows + webhook uses finalize |
| admin-paid-backfill | Metadata-only poison → reconcile | Payment rows restored | **PASS** | Repairs Admin Not paid split-brain |
| dismiss-unpaid-tombstone | Dismiss unpaid | Tombstone kept; RZP refused | **PASS** | No hard-delete |
| confirm-after-tombstone | Confirm after dismiss | Placed + payment rows | **PASS** | Convert-authorized overrides tombstone |
| webhook-after-tombstone | Webhook after dismiss | Placed + payment rows | **PASS** | Same recover path |
| success-recover-guards | Success recover wiring | Present | **PASS** | recover API + no `deleteDraftOrder` |
| snapshot-rebuild-after-parent-delete | Parent DELETE after RZP mint | Rebuild + Paid | **PASS** | Snapshot → new draft → payment rows=1 |
| concurrent-snapshot-rebuild | 3 parallel confirm after DELETE | One order | **PASS** | Claim lock; same pay_id → 1 order |
| 17 | Failed draft not in account | Hidden / deleted | **PASS** | Soft hidden; terminal gone |
| 18 | Admin status badges | attempted_failed vs failed | **PASS** | Metadata distinguishable |
| 19 | Capture race confirm vs webhook | No crash / single path | **PASS** | Parallel 200/200 |
| 20 | Cart remains after fail | Cleared only on success | **PASS (server)** | Soft-fail does not terminal-clear |
| 21 | GPay cancel → alternate | Success | **PASS (server)** | = soft-fail + reuse |
| 22 | Bank reject → alternate | Success | **PASS (server)** | = soft-fail + reuse |
| 23 | Card decline → alternate | Success | **PASS (server)** | = soft-fail + reuse |
| 24 | Wallet cancel → alternate | Success | **PASS (server)** | = soft-fail + reuse |

## Extra

| Check | Result | Notes |
|-------|--------|-------|
| Terminal-failed RZP reuse refused | **PASS** | Fresh RZP minted |

## Residual fixes (post-matrix)

- In-flight coalesce on `create-razorpay-order` (double-click → one RZP order)
- Refuse Razorpay mint when `payment_method=cod` (`cod_checkout_no_razorpay`)
- COD confirm blocks `attempted_failed`
- QA scripts use `qa-payment-matrix@example.com` only
- Success poller stops on consecutive 404 / max attempts (no infinite “Confirming…”)
- Razorpay confirm handoff via `oweg_pending_rzp_confirm` + URL replace with placed id
- Browser: dead id `order_01M19GRYAKD339XBV8XFMWH720` → “We couldn't finish confirming” within ~5s
- Webhook capture calls `finalizeRazorpayOrderPayment` (creates payment rows, not tx-only)
- Finalize no longer skips on summary `paid_total` alone (was leaving Admin Not paid)
- Confirm background reconcile when payment module finalize incomplete
- Repaired #846 (+ #845/#663/etc.) via `scripts/repair-razorpay-admin-paid.mjs`
- Terminal dismiss **tombstones** drafts (no hard-delete); Razorpay capture gate recovers if already paid
- Confirm/webhook/success recover path for missing/tombstoned drafts
- Incident `order_01M1BASH…`: captured orphan `pay_TWI7AoXCF7RYRV` **refunded** (draft already gone) — see `docs/incident-bash-orphan.json`
- Incident `order_01M1BEYG…`: parent hard-deleted; capture `pay_TWJLjsNYPmhcBm` **refunded** — see `docs/incident-beyg-orphan.json`
- `checkout_payment_snapshot` at RZP mint; recover rebuilds order when parent row is gone
- `razorpay_capture_claim` + advisory lock: one `pay_*` → one Medusa order under concurrent confirm/webhook
- Anushka #1059 kept; #1060/#1061 suppressed + cancelled (same `pay_TWJzAcoDNiPqWm`)
- `deleteDraftOrder` blocked unless `ALLOW_DRAFT_HARD_DELETE=1`; Medusa logs `[DRAFT_HARD_DELETE]`
- Runtime: use `C:\dev\oweg_ecom_module` — see `docs/runtime-path.md`

## Honest limits

- **PASS (server)** rows: Razorpay modal UI (GPay OTP / bank redirect / card 3DS) was not clicked; server lifecycle that backs those flows was verified.
- Placed QA orders may remain in Medusa admin from cases 1/8/9/16/19 — safe to archive/cancel.

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Eng (automated) | Cursor agent | 2026-08-31 | Full matrix **0 FAIL** (concurrent claim lock) |
| QA | | | |
