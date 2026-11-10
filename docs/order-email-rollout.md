# OWEG transactional order email

The Medusa scheduled job sends confirmation, shipment, delivery and cancellation emails from the PostgreSQL outbox. This applies to new events after enablement. An order can receive one email per milestone. For multi-seller orders the first shipment and delivery emails describe a package and link to the live order timeline. Medusa's order-level notification suppression still applies.

When enabled, the queue replaces the legacy automatic confirmation and the initial admin cancellation email. Customers can download invoices from Order Details. The initial cancellation email includes the customer-facing reason when the admin supplied one. Admin follow-up messages and vendor emails keep their existing paths.

## Enable in staging

1. From the Medusa directory, apply the additive migration using the staging database: `node scripts/install-order-email.cjs --apply`.
2. Configure `RESEND_API_KEY`, `RESEND_FROM` using a verified sender, and `ORDER_EMAIL_STOREFRONT_URL` with the canonical HTTPS origin. The service uses `STOREFRONT_URL` if the dedicated value is unset. Both order and support links use this origin.
3. Set `ORDER_EMAIL_ENABLED=true` and deploy to the Medusa environment processing events and scheduled jobs. A server-only Medusa process needs a worker that also has the email settings. The existing payment, partner settlement and push workers do not consume this queue.
4. Run a staging order through checkout, shipment, delivery and a separate cancellation. Confirm the recipient, inbox display, responsive rendering, deep links after sign-in and provider receipts. Check the Resend account's rate and sending quotas before rollout.

Repeat with production credentials and the production database after staging UAT. To pause, set `ORDER_EMAIL_ENABLED=false` on the affected Medusa processes. This pauses both capture and sends.

## Operations

- `accepted` means Resend returned a receipt. Use the provider dashboard to check delivery or bounce.
- The worker claims rows with short leases and row locks, sends serially with a bounded run time and backs off on transient provider errors. A stable idempotency key protects ambiguous retries within the provider's 24-hour window. The worker stops retries after 20 hours or eight attempts.
- If an address, template, storefront origin or sender changes after a send attempt, that row needs manual review before any resend. Verify the provider outcome before redriving failed work. Keep accepted and skipped receipts for as long as corresponding events can be replayed.
- An enqueue failure can occur before an outbox row exists. Inspect Medusa's event and application logs and reconcile the underlying order state before replaying the event. The ITL webhook requests redelivery on enqueue errors. Historical orders are not backfilled automatically.

```sql
SELECT event_type, status, count(*), min(created_at) AS oldest
FROM oweg_order_email_outbox
GROUP BY event_type, status;
```
