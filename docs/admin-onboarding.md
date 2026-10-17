# Subadmin onboarding and responsibilities

The superadmin creates roles in **Admin Access → Create role**. Select an entire section or just its individual responsibilities. Assign the role when creating a subadmin, or change it with **Edit access**. The server applies saved role changes to subsequent requests from existing sessions. Editor lookup data may be readable without permission to edit that data.

Newly provisioned subadmins and newly assigned admin accounts must change their password before using business pages or APIs. Reset credentials sends another temporary password and enables the requirement again. Existing assigned accounts keep their current password state during migration.

The password screen verifies the current credential, rejects reuse and requires 12–128 characters with uppercase, lowercase, a number and a symbol. A successful change revokes existing bearer tokens and cookie sessions, blocks refresh of revoked admin tokens, and asks the user to sign in again.

## Email configuration

Credential emails use the Medusa backend's existing SMTP transport: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` and optionally `SMTP_FROM_NAME`.

Set `ADMIN_SITE_URL` on the **Medusa backend** to the public admin app URL. The production default is `https://ecomm-admin-ecru.vercel.app/app`. Local development defaults to `http://localhost:9000/app`. HTTPS is required outside loopback. Do not use a request-supplied origin to build credential links.

Emails contain a greeting, login address, temporary password, role, creation/reset date in India time and instructions to change the password. Passwords are not saved in custom access/audit tables or logged. If SMTP delivery fails, the account remains created and the dialog explicitly reports failure. Copy the temporary credentials securely; after fixing SMTP, use **Reset credentials** to generate and email a fresh password. Do not create the same user again.

## Deployment

Deploy the Medusa backend and the admin app from the same revision. Before starting the updated backend, run the additive schema migration from `my-medusa-store`:

```sh
npx medusa exec ./src/scripts/migrate-admin-access.ts
npm run build
```

Restart `medusa-api` and redeploy the Vercel **ecomm-admin** app. Configure SMTP and `ADMIN_SITE_URL` on Medusa; customer storefront and vendor apps do not need these onboarding variables. The migration preserves existing accounts and roles and can be run again safely.

## Verification

```sh
npm run test:admin-access
npx tsc --noEmit
npm run build
```

For the API regression test, use a disposable Medusa instance backed by a separate local PostgreSQL database and a TLS SMTP capture server. Set `ADMIN_QA_URL`, `DATABASE_URL`, `ADMIN_QA_EMAIL`, and `ADMIN_QA_PASSWORD`, then run `node scripts/verify-admin-onboarding.cjs`. It refuses non-loopback URLs, creates disposable roles/users, checks mail delivery, password gates, wrong/reused/weak passwords, old token and cookie rejection, token refresh revocation, immediate permission edits, reset onboarding and disabled accounts. Do not point a local test instance at a shared database or external SMTP server. `ADMIN_QA_BROWSER_STATE` optionally saves the disposable credentials to a private ignored file for a visible browser demonstration.

In the browser, sign in with a disposable subadmin's temporary credential. Confirm redirection to **Set your own password**. Try opening a business URL; it must redirect back. The person using the account should enter and submit their new password themselves. Sign in again and confirm only the selected responsibilities are visible.
