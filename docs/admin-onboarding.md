# Subadmin onboarding and responsibilities

The superadmin creates roles in **Admin Access → Create role**. Select an entire section or just its individual responsibilities. Assign the role when creating a subadmin, or change it with **Edit access**. The server applies saved role changes to subsequent requests from existing sessions. Editor lookup data may be readable without permission to edit that data.

The creation actions are **Create role** and **Create subadmin**. Custom permission creation and its separate management tab are not shown. Existing custom definitions and assignments are preserved.

Newly provisioned subadmins and newly assigned admin accounts must change their password before using business pages or APIs. Reset credentials sends another temporary password and enables the requirement again. Existing assigned accounts keep their current password state during migration.

The password screen verifies the current credential, rejects reuse and requires 12–128 characters with uppercase, lowercase, a number and a symbol. A successful change revokes existing bearer tokens and cookie sessions, blocks refresh of revoked admin tokens, and asks the user to sign in again.

## Email configuration

Credential emails use the Medusa backend's existing SMTP transport: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` and optionally `SMTP_FROM_NAME`.

Set `ADMIN_SITE_URL` on the **Medusa backend** to the public admin app URL. Credential emails default to `https://ecomm-admin-ecru.vercel.app/app` in every environment. A localhost/loopback setting also falls back to that public address so recipients never receive an unusable developer URL. Other explicitly configured admin addresses must use HTTPS. Do not use a request-supplied origin to build credential links.

Emails contain a greeting, login address, temporary password, role, creation/reset date in India time and instructions to change the password. Passwords are not saved in custom access/audit tables or logged. If SMTP delivery fails, the account remains created and the dialog explicitly reports failure. Copy the temporary credentials securely; after fixing SMTP, use **Reset credentials** to generate and email a fresh password. Do not create the same user again.

Welcome and credential-reset messages use an OWEG-branded responsive HTML layout with a sign-in button, credential card, role/date details and first-login steps. A plain-text MIME alternative includes the same credentials and public login URL. The PNG logo uses the storefront's public asset URL; if images are blocked, the OWEG alternative text and all instructions remain available.

## Deployment

Customer and admin accounts may use the same public email with independent passwords. Admin emailpass credentials use an internal `oweg-admin:` provider key; the dashboard still accepts the normal email. Admin creation, first-login change, credential reset, and forgot-password all use the admin key, while customer credentials retain the ordinary email key. Admin-only legacy provider identities move to that key on admin sign-in/reset (or before customer registration) without changing the password hash. Customer/vendor identities are never moved or linked to an admin. Deploy the backend changes together; no password or database schema migration is required.

The Admin accounts table includes a Delete column. An active superadmin must enter the exact uppercase `CONFIRM` in the deletion dialog. Both the API and UI prevent self-deletion and protect all CLI-managed superadmin accounts. Subadmin and unassigned accounts are soft-deleted atomically with access revocation and an `account.deleted` audit event; audit history and login identities are retained. The deleted user is excluded from access lookups, blocking existing sessions and token refresh. Native Medusa user deletion is blocked so it cannot bypass this confirmation flow.

The optional password field shows the current backend requirement of 12–128 characters and marks each requirement as met or missing while typing. Leaving it blank generates a strong temporary password. These hints do not introduce additional composition rules.

Deploy the Medusa backend and the admin app from the same revision. Before starting the updated backend, run the additive schema migration from `my-medusa-store`:

```sh
npx medusa exec ./src/scripts/migrate-admin-access.ts
npm run build
```

Restart `medusa-api` and redeploy the Vercel **ecomm-admin** app. Configure SMTP and `ADMIN_SITE_URL` on Medusa; customer storefront and vendor apps do not need these onboarding variables. The migration preserves existing accounts and roles and can be run again safely.

If role creation reports `Invalid fields: permissions.0, permissions.1, ...`, the older backend validator may be rejecting the newer editor's responsibility IDs such as `orders.booking`. Deploying only the Vercel admin app does not update the Hostinger API. Rebuild the matching backend revision and restart the PM2 process that serves it; confirm its working directory with `pm2 describe medusa-api`.

`GET /admin/access/roles` now returns a `role_catalog` with version 2 and the supported IDs. The editor uses that server response to detect older backends and disables unsupported individual choices. Existing selections are retained and never replaced automatically by broader section access. Unknown or elevated grants remain rejected by the server.

## Verification

```sh
npm run test:admin-access
npx tsc --noEmit
npm run build
```

For the API regression test, use a disposable Medusa instance backed by a separate local PostgreSQL database and a TLS SMTP capture server. Set `ADMIN_QA_URL`, `DATABASE_URL`, `ADMIN_QA_EMAIL`, and `ADMIN_QA_PASSWORD`, then run `node scripts/verify-admin-onboarding.cjs`. It refuses non-loopback URLs, creates disposable roles/users, checks mail delivery, password gates, wrong/reused/weak passwords, old token and cookie rejection, token refresh revocation, immediate permission edits, reset onboarding and disabled accounts. Do not point a local test instance at a shared database or external SMTP server. `ADMIN_QA_BROWSER_STATE` optionally saves the disposable credentials to a private ignored file for a visible browser demonstration.

In the browser, sign in with a disposable subadmin's temporary credential. Confirm redirection to **Set your own password**. Try opening a business URL; it must redirect back. The person using the account should enter and submit their new password themselves. Sign in again and confirm only the selected responsibilities are visible.
