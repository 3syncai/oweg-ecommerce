# Payment reliability deployment

The storefront and Medusa backend both changed. Deploy them together during a checkout maintenance window after taking a database backup. Do not run QA scripts against production: they create disposable schemas and require schema privileges.

1. Deploy the merged code and install locked dependencies in both applications.
2. In `my-medusa-store`, run `npx medusa db:migrate` for the merged Medusa migrations, then `npm run payment:install` for the payment tables and constraints. Master includes a vendor earnings migration adding customer shipping columns. The payment installer is additive, transactional and repeatable. A duplicate historical ledger key/debit stops the installer; reconcile the records rather than deleting financial history.
3. Configure durable Redis in the backend using `REDIS_URL` (sessions, event bus, workflow execution and distributed locking). The installed queue driver requires Redis 5 or newer; local Windows Redis 3.0.504 is unsuitable. Production automatically enables the Redis modules when that URL is present. Local development keeps its existing event/workflow fallback unless `MEDUSA_DURABLE_REDIS=true` is explicitly set with a compatible server. Production Redis needs persistence, authentication, monitoring and a tested restore process.
4. Keep the existing Razorpay keys, webhook signing secret and refund encryption key stable. Configure `INTERNAL_API_SECRET` on the storefront and worker. Never change the bank encryption key while encrypted payout details exist.
5. Confirm that the affiliate receiver durably deduplicates `Idempotency-Key` / `event_id`, atomically with its commission writes, before setting `AFFILIATE_WEBHOOK_IDEMPOTENT=true`. Our queue retries delivery after timeouts and process death. Without this confirmation affiliate tasks stay visible as failed; customer payment accounting still commits.
6. Build and restart both services. From the storefront root, start `node scripts/payment-worker.cjs` under PM2/systemd with automatic restart, correct working directory and `PAYMENT_WORKER_APP_URL` pointing at the running storefront. It must be a persistent process, including when the storefront itself is hosted on a serverless platform. `npm run payment:status` is read-only.
7. Log in as superadmin and open **Payment Health**. Check the worker heartbeat, capture issues, pending/dead jobs and held coins. Retry a dead task only after fixing its listed cause. Retrying resumes recorded work; it does not initiate another customer charge or manual bank payout.
8. In Razorpay test mode, verify a blue-shoe purchase, bank decline followed by retry, duplicate confirmation/webhook, a restart during confirmation, and a partial manual refund with an actual operator-confirmed test payout reference. Verify payment/capture/accounting and quantities in Medusa. Live webhook delivery, Redis failover and real bank payout reconciliation need environment-specific sign-off.

Business rules: existing coin tier caps remain; coins cannot cover outward shipping. After the master sync, shipping is ₹50 below ₹500 goods subtotal and free at ₹500 or above. Original outward delivery charges are retained on returns. Refund allocation uses immutable paid item snapshots for new checkouts and integer paise arithmetic. Pre-existing orders use the legacy order basis; reconcile old orders whose financial history or prices were edited before processing refunds.

Known unresolved admin display issue: the order GST/vendor settlement summary does not pass payment method/delivery state into the settlement calculator and does not display its payment collection fee row. In the pre-master-sync walkthrough, test order #1176 (undelivered COD) displayed ₹1,105.69 instead of the calculator's ₹1,137.79 before delivery. In that same walkthrough, online order #1175 calculated ₹1,105.69, including a ₹32.10 fee which was not listed separately. Master also changes fee bases, so those historical amounts are not a certification of the newly merged calculations. The missing payment/delivery context in this summary has not been fixed by this change; do not use that preview alone to authorize vendor payouts. The worker was not restarted during the final local walkthrough, so new paid jobs remained pending. A passing checkout is not production sign-off.

Example server sequence after checkout is paused and the database is backed up (repository root; use the server's actual PM2 application names):

```bash
git pull --ff-only origin master
npm ci
cd my-medusa-store
npm ci
npx medusa db:migrate
npm run payment:install
npm run build
cd ../vendor-portal
npm ci
npm run build
cd ..
npm run build
pm2 list
```

Resolve any local Git divergence before pulling; do not reset away server changes or commit server `.env` files. Stop at the first failed command. Verify dependencies use the project's chosen lockfile/package manager if the server uses Yarn for Medusa instead of npm. Restart the actual Medusa, storefront and vendor process names with `pm2 restart <name> --update-env`. For the first worker deployment, set `PAYMENT_WORKER_APP_URL` and `INTERNAL_API_SECRET` in the storefront server environment, then from the repository root run `pm2 start scripts/payment-worker.cjs --name oweg-payment-worker` and `pm2 save`. If the worker already exists, restart that process with its updated environment rather than creating another copy. Run `npm run payment:status` and inspect superadmin Payment Health before reopening checkout. Vercel deployments still require a separate persistent host for this worker.

Manual payouts happen outside this application. Record the exact cash amount and unique bank/UPI transaction reference only after the transfer succeeds. The application atomically records the admin, immutable receipt, exact coin restoration, earned-coin reversal and retry task. If recording fails after a bank transfer, retry the same reference; do not transfer money again.

Database atomicity covers one PostgreSQL transaction. Razorpay, Redis and an external bank cannot join that transaction; signed capture verification, capture polling, durable outbox tasks, idempotent receivers and operator reconciliation handle those boundaries. This does not constitute a guarantee of every possible production failure.

Validation: `npm run test:payment`, `node scripts/verify-payment-outbound.cjs`, root and Medusa TypeScript checks, changed-file ESLint, Medusa admin access policy tests and production builds. Machine-readable test reports live in `docs/*qa-last-run.json`.
