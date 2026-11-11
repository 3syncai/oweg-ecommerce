# OWEG transactional order email

The Medusa scheduled job sends confirmation, shipment, delivery and cancellation emails from the PostgreSQL outbox. This applies to new events after enablement. An order can receive one email per milestone. For multi-seller orders the first shipment and delivery emails describe a package and link to the live order timeline. Medusa's order-level notification suppression still applies.

When enabled, the queue replaces the legacy automatic confirmation and the initial admin cancellation email. Customers can download invoices from Order Details. The initial cancellation email includes the customer-facing reason when the admin supplied one. Admin follow-up messages and vendor emails keep their existing paths.

## Enable in staging

1. From the Medusa directory, apply the additive migration using the staging database: `node scripts/install-order-email.cjs --apply`.
2. Use the SMTP configuration already used by Medusa's password-reset mailer. Confirm `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM_EMAIL` on the process that runs the email job. Set `ORDER_EMAIL_STOREFRONT_URL` to the canonical HTTPS origin. The service uses `STOREFRONT_URL` if the dedicated value is unset. Both order and support links use this origin.
3. Set `ORDER_EMAIL_ENABLED=true` and deploy to the Medusa environment processing events and scheduled jobs. A server-only Medusa process needs a worker that also has the email settings. The existing payment, partner settlement and push workers do not consume this queue.
4. Run a staging order through checkout, shipment, delivery and a separate cancellation. Confirm the recipient, inbox display, responsive rendering and deep links after sign-in. Check the existing SMTP relay's sending quotas before rollout.

Repeat with production credentials and the production database after staging UAT. To pause, set `ORDER_EMAIL_ENABLED=false` on the affected Medusa processes. This pauses both capture and sends.

## Operations

- `accepted` means the SMTP relay returned a successful final reply. Verify delivery in the inbox or relay logs. Search by the email Message-ID, which starts with `oweg-order-email-` followed by the outbox row ID.
- The worker claims rows with short leases and row locks, sends serially, and backs off on temporary SMTP rejections and connection failures before message submission. It stops retries after 20 hours or eight attempts.
- A connection loss after message submission or a crash before recording acceptance can leave delivery uncertain. The worker marks these rows `smtp_delivery_unknown` and holds them for review. Verify the relay logs before manually resending.
- If an address, template, storefront origin or sender changes after a send attempt, that row needs manual review before any resend. Verify the provider outcome before redriving failed work. Keep accepted and skipped receipts for as long as corresponding events can be replayed.
- An enqueue failure can occur before an outbox row exists. Inspect Medusa's event and application logs and reconcile the underlying order state before replaying the event. The ITL webhook requests redelivery on enqueue errors. Historical orders are not backfilled automatically.

```sql
SELECT event_type, status, count(*), min(created_at) AS oldest
FROM oweg_order_email_outbox
GROUP BY event_type, status;
```
