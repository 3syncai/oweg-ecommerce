# Partner and admin commission protection window

Partner, branch admin, area manager, and state admin commissions use the same
`affiliate_commission_log.unlock_at` for their pending countdown and payout eligibility.

After delivery, the hold uses the longer of the admin-configured return and
replacement days. A subcategory policy takes precedence over its parent; a
subcategory without its own policy inherits the nearest configured ancestor.
Products with no applicable policy use 7 days. Orders containing multiple
products use the longest product hold. Explicit 0/0 policies have no hold.

Example: 5 return days and 10 replacement days means credit eligibility 10 days
after delivery. The selected policy and delivery time are saved with the
commission, matching vendor behavior; later policy edits affect newly scheduled
commissions. Existing pending rows without a policy snapshot are upgraded once.
Already credited or cancelled rows are left alone.

## Deployment

Apply the migration to the shared commerce database **before** deploying the
storefront webhook and partner portal code. From `affiliate-portal`, with the
intended database's `DATABASE_URL` supplied through your deployment environment:

```sh
node scripts/run_unlock_trigger_migration.js
```

The runner defaults to `migrations/update_commission_unlock_policy.sql`.
It adds the policy snapshot columns, installs the policy/delivery resolvers,
replaces the old fixed-delay trigger, and repairs pending timers. It is safe to
rerun. The migration is transactional. No production database changes were made
during implementation.

`COMMISSION_UNLOCK_MINUTES` and `COMMISSION_UNLOCK_DAYS` no longer override admin
policies. The old timer-clearing and minute-based smoke scripts are not appropriate
for this policy-based flow.

## Verification

Partner portal: `npx tsc --noEmit --incremental false -p tsconfig.json`.

Database regression test, against a disposable localhost PostgreSQL database on
port 55440 only (creates and removes fixture tables; never use an application DB):

```sh
COMMISSION_POLICY_TEST_DATABASE_URL=postgres://localhost:55440/postgres \
  node affiliate-portal/scripts/test_commission_policy.cjs
```

Covers inheritance, overrides, missing policy defaults, explicit zero days,
variant product lookup, multiple products, pending legacy timer upgrades,
already credited rows, frozen dates, early-credit prevention, delivery
prerequisites, elapsed holds, migration idempotence, and the actual partner/admin
sync queries on repeated polls.

The `affiliate-portal/` directory was already untracked in this workspace. Include
the portal source and new migration in the intended repository/release so these
changes are deployed together with the storefront webhook.

## Debug settlement release

In `/debug-controller-4719`, **Move to settlement → Confirm release** now completes
both vendor holds and partner/admin commission holds for the selected order.
Partner, branch admin, area manager, direct ASM, state admin, and direct state
admin commissions are credited to their existing `customer_wallet` balances.
The action is protected by the existing debug-controller authentication.

Orders with only pending partner/admin commissions also appear in this list.
The action commits ledger updates and wallet credits in one transaction; retries
and concurrent clicks cannot credit the same commission twice. Missing wallet
recipients cause the whole release to roll back. Cancelled orders and active
return requests cannot be released. Already credited/cancelled rows are skipped.

This completes the commission's saved test protection window by shifting its
policy delivery anchor; actual order delivery timestamps and category policies
remain unchanged. It makes balances available for the normal payment/withdrawal
flow and does not send a bank payment. Apply the policy migration above first.
