# Hostinger rollout: vendor assignment and customer replacement choices

The configured RDS database was backed up and the six pending vendor migrations were applied and verified on 18 October 2026. Do not reset the database. The backup is local to the development machine at `/private/tmp/oweg-pre-vendor-migration-20261018.dump` (mode `0600`).

## Before restarting Medusa

1. Publish the reviewed workspace changes to the Git revision that the Hostinger service deploys. This workspace has uncommitted changes, so a server-side `git pull` alone will not include the new routes, jobs, UI, or migration files. Review `git status` before selecting files to commit; other work is present in the tree.
2. In Hostinger's environment configuration for the Medusa PM2 process, add `VENDOR_REPLACEMENT_CONSENT_SECRET` as a unique random hex string of at least 32 characters and `VENDOR_ASSIGNMENT_ALERT_EMAIL` as the admin exception inbox. If the process reads `my-medusa-store/.env` directly, add them there with restricted file permissions. Generate a secret on the server with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; do not reuse the local `.env` file or commit it.
3. Check `pm2 describe medusa-api` for the actual working directory and start command. In that directory, check `git status --short` and the current branch. Resolve any local server changes before pulling the reviewed revision. Run the project's dependency install only if the lockfile changed, then run `npm run build` in `my-medusa-store`.
4. Restart the actual Medusa process with `pm2 restart medusa-api --update-env`. If the worker runs as a separate PM2 process, restart that process too. Do not create a second worker until checking the existing PM2 process list; duplicated scheduled jobs can send duplicate alerts.

## Verify

- `pm2 status` shows the API and scheduled-job worker online; inspect `pm2 logs medusa-api --lines 100` for startup or migration errors.
- `https://api.oweg.itshover.com/health` returns HTTP 200 after restart.
- In admin, open an order with a pending vendor assignment. Verify the replacement vendor list, cancellation and reassignment actions, and the assisted customer code flow. Use a controlled test order so payment and refund actions do not affect a real customer.
- Confirm the four ten-minute jobs in `my-medusa-store/src/jobs/` are loaded and executing: overdue vendor acceptance, replacement request expiry, cancellation debit reconciliation, and replacement settlement reconciliation.
- Confirm customer account and vendor portal deployments include their matching workspace changes. The backend alone does not deploy their UI.
- `postal_location_cache` currently has zero rows. Import verified PIN centroids through the authenticated admin API before relying on distance ranking. Until then, checkout uses same-PIN or random eligible-vendor selection.
