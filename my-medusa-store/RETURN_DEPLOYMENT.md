# Returns: live configuration and customer photos

`krishna@sbi` passes the storefront and backend UPI validation. A screenshot containing Medusa `unknown_error` does not identify the backend exception. The old storefront proxy displayed upstream JSON verbatim. The new proxy displays a customer-facing error, and invalid request bodies return validation messages.

Both UPI and bank refund details require `RETURN_BANK_ENCRYPTION_KEY` on the Medusa server: a base64-encoded 32-byte key. Missing or invalid configuration now returns a controlled 503 before a return record is created, and logs a configuration error without payment details. An unset key is a possible live-only failure, not a confirmed diagnosis without server logs.

Use the same existing key for all deployments connected to the same database. Do not regenerate or replace a working key: existing encrypted refunds require it for decryption. Never put it in Git, frontend variables or customer-facing responses. After setting the server environment, restart the correct backend process (for PM2, use its actual process name and `--update-env` if changing process environment). Check live logs for `[Return] Refund configuration error` or the actual failed request exception. A local check cannot confirm the live process environment.

Superadmin and Returns Admin receive readable UPI details through Returns-authorized APIs. Encrypted payloads are omitted from these responses and customer responses. Refund data remains encrypted in the database; vendors do not receive payout details. A wrong/missing decryption key shows an explicit admin error and does not prevent viewing the remaining return information/photos.

Customers may attach up to 5 JPG/PNG/WebP photos, at most 3 MB each, and associate them with selected order items. Uploads verify customer ownership, item membership, file signature and size. S3 object keys are `returns/<customer-id>/<order-id>/<order-item-id>/<uuid>.<extension>`. Submission verifies every uploaded object and its ownership metadata. Retrying a failed submission reuses already-uploaded photos.

Configure `S3_REGION`, `S3_BUCKET` (or optional dedicated `RETURN_IMAGES_S3_BUCKET`) and S3 credentials/instance role on the backend. The bucket must allow the backend to put and read objects under `returns/*` and use server-side AES256 encryption. Prefer a private dedicated bucket for return evidence; images are exposed through short-lived signed URLs after customer/admin/vendor authorization. Images are not made public through object ACLs. Any pre-existing public bucket policy still applies, so use the dedicated private bucket when the product bucket is public. Apply a storage cleanup policy for abandoned uploads; cancelled/unsubmitted form uploads are not deleted automatically by this change.

Vendors see only return requests, returned items and photo references for their own products, including orders split between multiple vendors. Admins see all submitted return photos. Refresh the page to renew expired photo links. Older returns remain valid and display without photos.

No schema migration is required for photos: references are stored in existing return-request metadata. Deploy/rebuild the storefront, Medusa backend/admin and vendor portal; restart the backend. This code change cannot repair a missing live environment variable without access to that server.
