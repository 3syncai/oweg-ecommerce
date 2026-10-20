# OWEG payment worker guide

Updated: 20 October 2026

## Purpose

The payment worker is a persistent background process named `oweg-payment-worker` in PM2. It keeps payment recovery and queued follow-up work running without requiring a customer browser session.

The script is `scripts/payment-worker.cjs` in the repository root. It calls the storefront's authenticated `POST /api/internal/payment-work` endpoint. The storefront performs the actual work using its database and service configuration.

The worker supports:

- Reconciling captured Razorpay payments that need recovery.
- Retrying payment follow-up work, including order readiness, inventory reservations, coins and coupon settlement.
- Delivering queued affiliate notifications when their idempotency contract is configured.
- Synchronizing return settlement metadata.

A running process alone does not prove every payment or queued task is healthy. Check both fresh worker logs and Payment Health.

## Application layout

On the current VPS:

```text
/var/www/oweg/oweg-ecommerce/                    Storefront and worker root
/var/www/oweg/oweg-ecommerce/scripts/payment-worker.cjs
/var/www/oweg/oweg-ecommerce/my-medusa-store/    Medusa backend
```

PM2 runs `medusa-api` and `oweg-payment-worker` as separate processes. Restarting one does not restart the other.

## Configuration

The script loads Next.js environment files from its working directory and reads:

- `PAYMENT_WORKER_APP_URL`: preferred storefront base URL, for example `https://oweg.in`.
- `NEXT_PUBLIC_APP_URL`: fallback when the preferred URL is absent.
- `INTERNAL_API_SECRET`: required; must match the storefront's internal API configuration. Never include its value in screenshots or documentation.

If neither URL variable is present, the script uses `http://localhost:3000`. Set the preferred URL explicitly when the storefront is hosted elsewhere.

The worker needs root application dependencies, including Next.js's `@next/env`. Installing dependencies only inside `my-medusa-store` does not install them for the root worker script.

## Install or repair root dependencies

Run from the repository root:

```bash
cd /var/www/oweg/oweg-ecommerce &&
npm ci &&
node -e "console.log(require.resolve('@next/env'))"
```

Stop if installation fails. `npm ci` installs the versions in the root lockfile and replaces the root `node_modules` directory. It does not rebuild the storefront or backend.

## Start the worker for the first time

Configure the environment first. Create this process only if it does not already exist:

```bash
cd /var/www/oweg/oweg-ecommerce &&
pm2 start scripts/payment-worker.cjs --name oweg-payment-worker --cwd /var/www/oweg/oweg-ecommerce &&
pm2 save
```

`pm2 save` saves the process list. Reboot recovery also requires PM2 startup integration to have been configured on the VPS.

## Restart an existing worker

```bash
cd /var/www/oweg/oweg-ecommerce &&
pm2 restart oweg-payment-worker --update-env
```

Do not create a second worker process to repair an existing one.

## Verify operation

```bash
cd /var/www/oweg/oweg-ecommerce
pm2 status
npm run payment:status
pm2 logs oweg-payment-worker --lines 0 --timestamp
```

Wait for fresh logs, then press Ctrl+C to leave the log viewer. This does not stop the worker.

`payment:status` sends a status-only request and prints queue counts; it does not run a processing cycle or update the processing heartbeat. A successful response confirms that this command reached and authenticated with the configured endpoint at that time.

Normal processing logs resemble:

```json
{
  "at": "2026-10-20T15:34:21.569Z",
  "reconciliation": { "checked": 0, "recovered": 0, "failed": 0 },
  "work": { "completed": 0, "failed": 0 }
}
```

- `checked`: capture-watch orders examined during this cycle.
- `recovered`: captured payments recovered during this cycle.
- `reconciliation.failed`: capture-watch reconciliation failures during this cycle.
- `completed`: queued jobs completed during this cycle.
- `work.failed`: queued jobs that failed during this cycle.

Zero counts can simply mean there is no work currently due. They do not mean the database contains no old failed jobs.

The script waits 10 seconds after each cycle finishes before starting another. Requests have a 110-second timeout, so logs may be further apart during slow requests. A successful processing cycle records its heartbeat in `payment_worker_status`.

## Dead jobs

A status response such as this means one queued job is in the dead state:

```json
{"queue":[{"state":"dead","count":1,"oldest":"2026-10-19T12:23:59.485Z"}]}
```

The `oldest` value is the oldest job creation timestamp in that state, not necessarily the time it last failed.

Open **Superadmin → Payment Health** and inspect the task type, associated record and last error. Fix the underlying cause before using its retry action. Retrying resumes recorded work; do not manually repeat a customer charge or bank transfer to repair a queue failure. Do not delete financial history to clear a warning.

## Troubleshooting

### Cannot find module '@next/env'

Install root dependencies using the command above, verify module resolution and restart the existing worker. This was the startup failure observed on the VPS on 20 October 2026.

### INTERNAL_API_SECRET required

Confirm the worker's working directory is the repository root and the secret is configured there or in its process environment. It must match the storefront. Do not print the secret while diagnosing it.

### payment_worker_http_401 or payment_worker_http_403

Check internal API authentication and the configured storefront URL. Do not remove authentication to bypass the error.

### payment_worker_http_404

Check that the configured URL serves the deployed storefront containing `/api/internal/payment-work`.

### payment_worker_http_503 or network/timeout errors

Check the storefront's server logs, connectivity and its database/backend dependencies. A 503 can mean a processing cycle failed; the worker's HTTP message alone does not identify the underlying cause.

### PM2 says online but logs show old errors

PM2 keeps previous log entries after restarts. Compare timestamps and observe fresh output:

```bash
pm2 logs oweg-payment-worker --lines 0 --timestamp
```

Do not flush logs merely to hide a failure. PM2's restart count is cumulative and does not by itself show whether the latest restart succeeded.

## Current observed VPS state

At approximately 15:34 UTC on 20 October 2026, the screenshots showed both PM2 processes online, a successful status request and a fresh worker processing cycle with zero failures. One older dead job remained for investigation. This is an observation at that time, not a guarantee of ongoing health.

## Deployment scope

This guide covers worker operation. For full payment deployment prerequisites, schema setup, Redis configuration and verification, see [PAYMENT_RELIABILITY_DEPLOYMENT.md](./PAYMENT_RELIABILITY_DEPLOYMENT.md). Do not run migrations or payment installers solely to repair a missing Node.js dependency.
