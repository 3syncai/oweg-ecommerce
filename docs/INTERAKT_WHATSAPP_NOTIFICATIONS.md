# Interakt WhatsApp order notifications

## Repository findings

- Backend: Medusa 2.11.3, PostgreSQL, existing shared `pg` pool and module-owned MikroORM migrations. No new dependency is required.
- ITL: `src/services/easy-ship/itl.ts` already creates shipments with `/api_v3/order/add.json`, receives AWBs, builds tracking URLs and polls `/api_v3/order/track.json`.
- Carrier identity/status lives in order metadata, including `vendor_order_workflows[vendorId]`. The shared `shiprocket_awb`, `shiprocket_order_id`, `shiprocket_status` and `tracking_url` fields are also used by ITL. They are deliberately retained.
- Existing webhook: `POST /custom/itl/webhook`; its existing handler checks `ITL_WEBHOOK_SECRET`, resolves the order by AWB/provider order ID and validates logistics transitions. Presence of this route does not prove that the production ITL account is registered to call it.
- Existing fallback: `sync-vendor-shipment-tracking` runs every ten minutes. Both webhook and polling now enqueue into the same outbox.
- Registered mobile/name come from the Medusa customer referenced by `order.customer_id`. The public order reference is `order.display_id`. Shipping/billing phone is not substituted for the registered mobile.
- Transactional WhatsApp order updates apply to every customer with a valid registered mobile number. No checkout checkbox or consent metadata is required. Sending remains controlled by the backend enable switch.
- MSG91 OTP implementation is unchanged. Interakt has a separate service and configuration.

## Files and behavior

- `src/services/interakt/interakt.service.ts`: phone normalization, eligibility, AES-256-GCM encryption, template selection and timeout-controlled HTTP requests.
- `src/services/interakt/outbox.ts`: durable enqueue, atomic claims, failure records, retries and sanitized outcome logs.
- `src/modules/whatsapp-notification`: Medusa notification-log model/service and SQL outbox migration registered in `medusa-config.ts`. The table is intentionally managed by this explicit migration, without generated public CRUD routes.
- `src/subscribers/whatsapp-order-placed.ts`: only `order.placed`, independent of email/invoice subscribers and the checkout transaction.
- Existing ITL handler/tracking sync: reuse existing shipment matching, status processing and provider tracking URLs.
- `src/jobs/send-whatsapp-notifications.ts`: drains up to 20 notifications per run, every minute.

The three approved templates use `en` and body variables in exactly this order:

| Event | Template | Body variables |
| --- | --- | --- |
| order_placed | order_confirmation_utility | registered customer first name, display ID |
| order_shipped | order_shipped_utility | registered customer first name, display ID, HTTPS tracking URL |
| order_delivered | order_delivered_utility | registered customer first name, display ID |

Missing first names use the order shipping first name, then `Customer`. There is no hardcoded recipient or order reference.

ITL's official domestic v3 documentation lists `Picked Up` and `In Transit` as forward movement, and `Delivered` as customer delivery. These movement states map to the business shipped event; the existing integration's `Shipped` label is also accepted. Matching is exact (case/whitespace/underscore normalized). Booking, labels, out-for-delivery, NDR, reverse/RTO, unknown and numeric status codes do not independently trigger a notification. A stale shipped event after a delivered/cancelled/RTO workflow is excluded. Fulfillment creation never triggers this service.

Polling preserves the provider's raw current status for notification classification; it does not reuse the existing broad substring normalizer. Failed tracking requests cannot create notifications from fallback/stale statuses.

The database key is `(order_id,event_type)`, across all vendors and webhook/polling sources. As requested, there is one notification of each type per order: the first eligible parcel supplies its tracking URL and delivery event. This is not a per-parcel notification system or an aggregation asserting that every parcel in a split order has arrived. Confirm that policy before enabling for split orders.

## Customer eligibility

Order confirmations and ITL shipment/delivery updates are sent automatically to every customer with a valid registered Indian mobile number. No consent checkbox or `whatsapp_order_notifications_consent` metadata is checked at enqueue or send time, including historical `false` values. Existing metadata is preserved, not rewritten to imply an opt-in.

Missing/invalid registered numbers still produce failure records. A changed registered phone is held as `registered_phone_changed` to prevent a queued message from being redirected to a different number; correct the recipient and review the same record before replay. Guest orders without a linked registered mobile fail eligibility. Historical failed notification rows are not automatically replayed by this policy change.
## Reliability and delivery semantics

- Enqueue uses `ON CONFLICT DO NOTHING`; separate replicas claim rows with `FOR UPDATE SKIP LOCKED`.
- The HTTP call executes only in the job. API failures cannot roll back an order.
- `PENDING` means queued/retrying; `SENT` means Interakt accepted the request and returned a message ID. `delivery_status=ACCEPTED` does **not** assert WhatsApp delivery. `FAILED` includes invalid/missing phone, tracking, configuration and terminal/ambiguous API failures.
- API credentials and response bodies are never logged. The log stores a masked phone; full phone/name/template values are encrypted together in `payload_encrypted`.
- Pre-send temporary customer lookup failures and explicit HTTP 429 rejection retry with exponential delay (120, 240, 480, 960 seconds), at most five total attempts. No immediate retry loop.
- Timeouts, connection failures, HTTP 408/5xx and malformed success responses can occur after provider acceptance. They are held for reconciliation instead of blindly resent. Interakt's documented API does not provide a confirmed server-side idempotency contract for this integration. Local uniqueness alone cannot guarantee exactly-once external delivery after an uncertain HTTP result.
- Claims older than five minutes become `FAILED / worker_outcome_unknown`. A database acknowledgement failure after API acceptance leaves the claim intact, also requiring reconciliation.
- With this feature enabled, the existing Redis event-bus config gains five attempts with exponential backoff for failed subscribers. Installed Medusa preserves completed subscriber IDs so successful subscribers are skipped on retry. This option applies to all failed event subscribers while enabled; explicit emitter options can override it. Production must use durable Redis; the default in-memory development bus cannot survive a restart. Alert on exhausted enqueue failures.
- ITL enqueue DB failures return 503 after existing shipment/earnings processing, allowing webhook replay. Repeated statuses can repair an absent outbox entry; the unique key prevents duplicate sends. Polling enqueue happens before persisting its new status and can repair a delivered status on subsequent tracking reads.

Reconcile uncertain outcomes in Interakt using the logged message ID or opaque `callbackData` (the notification row ID). Mark a row `SENT` with the confirmed message ID if accepted. Only after verifying a request was not accepted should an operator reset that same row to `PENDING`, clear `processing_at`, set `next_attempt_at=now()` and reset attempts as appropriate. Never delete the unique record or automatically replay all failed rows. Correct eligibility/data before reviewed replays.

Interakt delivery webhooks were evaluated: official docs provide `message_api_sent`, `message_api_delivered`, `message_api_read` and failure callbacks, with an `Interakt-Signature` HMAC-SHA256 signature over the raw body. This implementation does not add a delivery callback endpoint. A future callback must verify the raw-body signature with the separately shared webhook secret, correlate `data.message.id`/callback data, and apply monotonic delivery status updates. Until then, actual delivery must be verified in Interakt; API acceptance remains separate.

## AWS ECS deployment

1. Deploy the backend source/image through the existing release pipeline. No frontend environment variables are needed. Keep `INTERAKT_ENABLED=false` until migration, provider configuration and staging checks are complete.
2. Put `INTERAKT_API_KEY` and an independent `INTERAKT_LOG_ENCRYPTION_KEY` into AWS Secrets Manager or SSM SecureString. Generate the latter as 32 cryptographically random bytes encoded in 64 hex characters. Keep the key consistent across all API/worker tasks and releases; retain it for pending messages and encrypted log retention. Rotation requires re-encryption or explicit key versioning, not an immediate replacement.
3. Reference these secrets in the ECS task definition's backend container `secrets` configuration. Give the task execution role access only to the required secret ARNs and KMS decrypt permission where applicable. Do not bake secrets into an image, commit them, or use `NEXT_PUBLIC_` variables. Scope DB/log access and RDS backups appropriately; set an operational retention policy for encrypted notification payloads.
4. Set the nonsecret backend environment values from `my-medusa-store/.env.template`: the fixed Interakt API URL, three template names, and enable switch. Confirm all three templates are approved in English in the same Interakt account.
5. Set the existing `DATABASE_URL`, durable `REDIS_URL`, production Medusa secrets, and live ITL settings (`ITL_MODE=live`, existing credentials and webhook secret). Use the existing API/worker process topology; ensure a Medusa worker/shared process loads subscribers and scheduled jobs. No standalone Interakt service is required. API/worker ECS tasks need outbound HTTPS access to Interakt and the existing ITL endpoints, plus DB/Redis access.
6. Run `npm run migrate` once from the backend directory in a release task with the same database configuration, before enabling the worker. The added migration creates `whatsapp_notification_log` with its unique constraint and pending index; the existing migration command also applies any other pending backend migrations. The command is the existing Linux deployment script; from Windows use `npx medusa db:migrate` with the normal backend environment. Do not run migration generation against this explicitly managed outbox to replace its schema.
7. Confirm the actual ITL account posts to the existing HTTPS `/custom/itl/webhook` route and supplies an existing supported secret header (`x-api-key`, `x-itl-webhook-secret` or `x-itl-signature`). The last header is currently treated by the repository as a shared secret, not a provider HMAC. Verify the real account's webhook payload/header contract and retry policy with ITL; no new provider signature scheme is assumed. Keep the authenticated polling fallback running.
8. Enable `INTERAKT_ENABLED=true` on the API and worker tasks and roll out the new task definition. Monitor CloudWatch sanitized `interakt` outcomes, pending age, failed count and Redis subscriber failures. Multiple workers are protected by PostgreSQL claims/uniqueness, though throughput and provider limits still need monitoring.
9. Rollback switch: set `INTERAKT_ENABLED=false` on API and worker tasks. Retain the table and encryption key for audit/reconciliation. Do not drop logs as part of application rollback.

Safe operational query (no recipient/payload output):

```sql
SELECT event_type, status, error_details, count(*)
FROM whatsapp_notification_log
GROUP BY event_type, status, error_details;
```

## Verification

Verified locally: 37 tests passed and the backend TypeScript check completed with no diagnostics. The WhatsApp module migration was subsequently applied through the Medusa migrator during local testing, and a consented test confirmation was accepted by Interakt with a recorded message ID. Actual WhatsApp delivery has not been independently verified.

From `my-medusa-store`:

```powershell
node --test --require ts-node/register/transpile-only src/lib/__tests__/interakt-notifications.test.ts src/lib/__tests__/interakt-itl-hooks.test.ts src/lib/__tests__/shipping-estimate.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Tests mock HTTP and database boundaries, exercise the existing ITL handler/polling, and check MSG91 OTP requests. They do not prove a live PostgreSQL migration/locking behavior, ITL account registration, AWS IAM/network access, template approval, real WhatsApp delivery. Run the following in staging before rollout:

- [ ] Apply migration; inspect unique `(order_id,event_type)` and pending index. Run concurrent API/worker replicas against PostgreSQL and verify one send per event under concurrent claims/replays.
- [ ] With the feature disabled, place a normal paid/COD order and confirm existing checkout, invoice, logistics and OTP behavior.
- [ ] Place an order for a registered test customer with a valid mobile number and no consent metadata. Confirm one order-confirmation message uses first name/display ID and records the Interakt ID with `ACCEPTED`.
- [ ] Replay `order.placed`; verify one database row/message. Verify enqueue retry after a temporary DB outage using the durable Redis event bus.
- [ ] Book the ITL shipment; verify no shipped message from booking/fulfillment alone. Receive actual carrier Picked Up/In Transit status (or the existing verified Shipped feed); verify one shipped message with its tracking URL.
- [ ] Replay the authenticated webhook and run the existing tracking sync concurrently; verify no duplicate shipped message. Test invalid secret, unmatched AWB, unsupported status, NDR and RTO without WhatsApp sends.
- [ ] Receive customer Delivered status, then replay it/poll; verify one delivery message. Verify reverse/RTO Delivered is excluded. Test the documented split-order policy explicitly.
- [ ] Remove/invalid the registered phone or remove the tracking URL; verify safe failure records and no sends. Verify that absent/false consent metadata does not block valid messages, and test registered number changes.
- [ ] Simulate 429 in a mock/staging transport; verify backoff, attempt cap and eventual success. Simulate timeout/5xx and worker termination after send; verify manual-reconciliation failures and no automatic second send.
- [ ] Confirm that an Interakt outage does not affect order placement or existing ITL earnings/status updates. Verify login/forgot-password OTP against the existing MSG91 staging configuration.
- [ ] Compare accepted IDs against actual WhatsApp receipt in Interakt. Do not report a 201 response as delivered.

Official references consulted:

- [Interakt template API](https://www.interakt.shop/resource-center/how-to-send-whatsapp-templates-using-apis-webhooks/): Basic key authentication, body variables, returned message ID, callbackData and 429 limits.
- [Interakt webhooks](https://www.interakt.shop/resource-center/interakts-webhooks/): delivery callback events, message IDs and raw-body HMAC authentication.
- [ITL domestic tracking v3](https://docs.ithinklogistics.com/doc-track-order/3): existing tracking endpoint, forward/reverse status names and `current_status` response field.
