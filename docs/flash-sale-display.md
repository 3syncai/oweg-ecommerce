# Flash sale headings and complete deals page

- The admin's optional title is now sent with the save request, validated (text,
  at most 120 characters), and stored on every item created in that batch.
- Store API returns this as `flash_sale.title` and on each product's sale data.
  When overlapping batches exist, the main heading follows the earliest expiry,
  matching the existing countdown. Older rows without a title use “Deal of the Day”.
  Previously typed-but-unsaved titles cannot be recovered automatically.
- “View all deals” opens `/flash-sale`, with a responsive grid of all active,
  published, in-stock sale products. Its independent API cache requests `all=1`;
  catalogue and stock lookups stay bounded to pages/batches instead of truncating
  at the homepage's 60-item merchandising limit.
- Durations of 24 hours or more show Days / Hours / Minutes / Seconds; shorter
  durations retain Hours / Minutes / Seconds. Polling and expiry refresh rules,
  cart variant IDs, sale prices and wishlist actions are retained.

## Deployment prerequisite

The nullable `flash_sale_item.title` column requires migration
`Migration20261031120000`. Apply migrations before starting the updated backend,
then deploy the matching admin and ecommerce frontends. This patch does not run
migrations or publish any real sale. Never run migrations against a shared/live
database merely to preview the UI. Authentication and authorization are unchanged.

Checks: frontend/backend TypeScript, scoped storefront lint,
`node --test scripts/flash-sale-display.test.cjs scripts/cpu-request-regressions.test.cjs scripts/home-discovery.test.cjs`.
