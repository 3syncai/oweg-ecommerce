# Medusa admin access

There is one superadmin, created or promoted through the CLI. Only that account can create Medusa subadmins, assign roles, change permissions, enable or disable access, or generate replacement credentials.

## Initial setup and deployment

Run the setup against the intended database **before starting the new API version**:

```powershell
$env:SUPERADMIN_EMAIL = 'rakchy@oweg.com'
npm run admin:bootstrap
```

The command creates the access tables, seeds the eight default roles, and creates or promotes the selected Medusa user. A database constraint prevents a second superadmin. Repeating the command for the same email retains its password and preserves edited roles. Selecting a different email after setup fails.

For a new account, the CLI generates a strong password and saves its credentials in `.local-admin/superadmin-credentials.txt`. This directory is excluded from Git. Alternatively, set `SUPERADMIN_PASSWORD` before running the command. Existing accounts keep their existing credentials; the CLI never resets them implicitly.

The additive schema is in `src/lib/admin-access/schema.ts`. Schema creation runs only through the CLI, never during HTTP requests. Include `admin:bootstrap` in deployment setup when initializing a new database. No user is automatically elevated because it existed before setup.

## Using the dashboard

Sign in at `/app/login` and open **Admin Access** (`/app/admin-access`).

1. Use **Roles & responsibilities** to edit the eight defaults or create a custom role. A role can include multiple permission groups, or no business access.
2. Use **Create subadmin** to create a login and choose its role. Leave the password blank to generate a strong one. Credentials are returned once and are never stored in the access tables or audit log.
3. Existing Medusa users appear as **Unassigned**. Use **Assign access** to give them a role. They have no business access until assigned.
4. **Edit access** changes the assigned role or disables the account. Permission and disable changes are checked on every API request, including existing sessions.
5. **Reset credentials** generates a replacement password for a subadmin. Older tokens are rejected using their issue time (JWT timestamps have one-second precision).
6. **Activity** shows the latest 100 account, role, credential and CLI bootstrap events.

### Adding a permission option

The superadmin can use **Create permission** or the **Permissions** tab to add a named permission beyond the eight preset groups. Enter its responsibility, the admin page path(s) after `/app`, and the backend `/admin/` API section(s). Choose **View only** or **View, create, edit and delete**. The new option then appears in every role editor.

For example, create **Customer groups only** with page `/customer-groups` and API `/admin/customer-groups`, then assign it to a custom role. This grants customer-group access independently of the broader Customers preset. Definitions apply to the specified section and its descendants. A newly implemented feature can be registered the same way; registering a permission does not build the feature itself.

Editing or disabling a custom permission affects every role using it on subsequent requests. Account/role/permission management, invitations, API keys, and generic workflow execution remain reserved for the superadmin. Root grants, wildcard paths, traversal, and reserved routes are rejected. The Inventory UI remains reserved for the superadmin.

For an existing deployment upgrading from preset-only permissions, first apply the additive schema upgrade:

```powershell
npx medusa exec ./src/scripts/migrate-admin-access.ts
```

This preserves current accounts, passwords, roles and grants. Fresh databases can continue to use `admin:bootstrap`.

Subadmins have a **My Access** landing page and only see the sections their role allows. The API independently enforces permissions; menu visibility is not an authorization boundary. Native invitations are disabled in favor of the role-aware provisioning flow. An existing CLI-created admin without an assigned access record is also denied business access.

## Default responsibility groups

- **Customers:** customers and customer groups.
- **Product head:** products, brand collections, categories and price lists.
- **Orders:** orders, draft orders and packet booking.
- **Returns:** return requests/approval, return packet booking and core returns.
- **Vendors:** vendors, vendor requests and authorizations.
- **Marketing:** flash sales, homepage brands/banners, promotions and campaigns.
- **Accounting:** vendor payouts, commissions, claims/reports and marketplace tax.
- **Partner admins:** the existing partner administrator/application system.

Medusa account administration is never a grantable permission group. The superadmin alone owns it. Partner administrator accounts belong to the existing separate partner system; they do not become Medusa admin users.

Inventory is visible in the superadmin navigation. Subadmins cannot open Inventory URLs and are redirected to My Access, even with custom grants. Product stock functionality and the inventory backend remain available to commerce workflows.

Customer-only accounts see the complete customer detail page with a paginated, read-only order overview. `/admin/customers/:id/order-summary` fixes the customer scope on the server and projects only the order number/date/status/payment/fulfillment/total fields. It rejects field expansions and alternate customer filters; full order reads and writes remain denied. Accounts with Orders management retain the native order table. Restricted cross-section references cannot navigate to inaccessible pages, and Returns-only actions/widgets require Returns access. Missing summaries on legacy orders display “Not available” instead of crashing or fabricating an amount.

The dashboard compatibility patches are reapplied on install and before `npm run dev` / `npm run build` by `scripts/patch-customer-order-overview.cjs` (including `patch-order-summary.cjs`). They validate the Medusa 2.11.3 source/bundle shape and stop for review if an upgrade changes it.

Some editors need read-only lookups from other areas: order creation needs products/customers, returns need their orders, accounting needs vendors/orders, and marketing needs product/category/brand selectors. These lookup requests do not grant modification rights or display the other section in the sidebar. Unmapped API routes and settings are restricted to the superadmin. Existing secret API keys retain commerce API access for server integrations, but cannot manage users, roles, invitations, or API keys.

## Verification

```powershell
npx tsc --noEmit
npm run test:admin-access
node scripts/verify-admin-access.cjs
node scripts/verify-subadmin-functionality.cjs
```

The live smoke test uses the local superadmin credential file, or `RBAC_TEST_EMAIL` / `RBAC_TEST_PASSWORD`, against `http://localhost:9000`. It creates one temporary role/account, checks login, isolation, account management denial, permission changes, disable/re-enable, password reset, audit safety and the database singleton constraint, then removes only its test records. The test never logs passwords or tokens.

The functionality test reads the eight existing credentials from the ignored `.local-admin/subadmin-credentials.txt`. It verifies role-specific API dependencies and detail reads, customer order scope/field restrictions/pagination, denied administration access, and create/edit/delete on disposable customer groups, brand collections and campaigns. It never submits live payouts, refunds, courier bookings, vendor approvals or partner account creation.

## Admin activity history

The superadmin has a separate **Activity Log** sidebar entry at `/app/activity-log`. It contains the existing account/permission history plus Medusa admin sign-ins, failed sign-ins, session creation/logout, browser navigation, API reads, submitted actions, deletions, failures and access denials. Filters cover admin, activity type, outcome, dates and email/action/path/IP/city search. Pagination uses a fixed snapshot until Refresh is selected. Details show the admin identity and role at the time, timestamp, resource ID/path, HTTP result, duration, IP, approximate location and user agent. History remains available after an admin is removed. No API is provided to edit or delete history.

The default **Admin Activity** view shows sign-ins/sign-outs, page visits, account/permission changes and submitted writes with readable descriptions. Automatic GET/HEAD requests, session-creation transport records, payout calculations and page-report instrumentation are hidden from this view. Successful access-management requests with a matching semantic audit record appear once. Consecutive same-admin page visits with the same path/result/IP/browser within 60 seconds are grouped; intervening meaningful actions break the group. Counts, filters and pagination operate on the grouped feed. Sign-in location is shown inline; other events retain location/IP in their detail drawer.

**Technical Requests** retains the complete individual audit trail, including background reads and denials. It does not assert that every request was a click. Filtering/grouping happens only when reading; no stored audit history is deleted or changed. The activity API defaults to `view=activity`; diagnostics that need raw records must request `view=technical`.

`node scripts/verify-activity-feed.cjs` checks the SQL presentation logic using synthetic, read-only rows, then verifies both live views, filters, stable pagination and authorization. It does not insert or delete audit history.

Apply the additive schema upgrade before deploying this version:

```powershell
npx medusa exec ./src/scripts/migrate-admin-access.ts
```

IP geolocation uses the bundled `geoip-lite` database locally; admin addresses are never sent to an external lookup service. Locations and coordinates are approximate and describe the public network exit (possibly a VPN), not GPS or a verified physical address. Local/private networks and missing historical locations are labeled explicitly. Maintain the offline database with the geoip-lite project's update tooling and your MaxMind license/data feed as needed.

By default the audit uses the socket peer address and ignores forwarding headers, independently of Express's proxy setting. Behind a reverse proxy, set `ADMIN_AUDIT_TRUSTED_PROXIES` to that deployment's exact proxy IPs/CIDRs (comma separated). Every proxy must append/replace `X-Forwarded-For` correctly and the backend origin must be restricted to the intended proxy path. The resolver walks the chain from the socket and stops at the first untrusted address; never configure arbitrary internet clients as trusted proxies. No proxy trust was added automatically for localhost.

Passwords, tokens, cookies, authorization headers, query values, form values, file contents and response bodies are not logged. Successful writes may record a known resource ID, and submitted field names are listed with credential/payment-related keys excluded. Account/role/permission changes retain their explicit validated audit details. Browser navigation is labeled as browser-reported; the API independently records actual requests/results. This does not record keystrokes or a screen video. Events are written when requests finish; logging failures are reported to the server console without changing completed commerce responses. Database administrators retain access to the underlying history, so use normal database backups/monitoring and controlled database access. No automatic retention purge is enabled.

For live verification with a disposable subadmin:

```powershell
node scripts/verify-admin-activity.cjs setup
node scripts/verify-admin-activity.cjs check
node scripts/verify-admin-activity.cjs cleanup
```

Credentials are kept only in the ignored `.local-admin/activity-qa-state.json` fixture file. The check creates/removes one temporary customer group, verifies login/logout/navigation, write/read/denial events, filtering, pagination, spoof protection and secret exclusion. Cleanup removes only its temporary login; activity evidence is retained.
