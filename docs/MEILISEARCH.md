# Meilisearch (VPS) — QWEG product search

Free, self-hosted search used by the storefront header suggestions and `/search`.

## 1. Start on the VPS

```bash
cp .env.meilisearch.example .env.meilisearch
# edit MEILI_MASTER_KEY to a long random secret
docker compose -f docker-compose.meilisearch.yml --env-file .env.meilisearch up -d
curl http://127.0.0.1:7700/health
```

Firewall: keep port `7700` private (localhost / private network only). Do not expose the master key to the browser.

## 2. Env vars (Medusa + Next.js)

```bash
MEILI_HOST=http://127.0.0.1:7700
MEILI_MASTER_KEY=<same as docker>
# optional:
# MEILI_PRODUCTS_INDEX=products
```

## 3. Full product sync

```bash
cd my-medusa-store
npx medusa exec ./scripts/sync-products-to-search.ts
```

After that, approve / publish / draft / reject / delete keep the index updated automatically.

## 4. Verify

- Header search suggestions while typing
- `/search?q=...` results page
- Live typo checks: `npm run test:search-typos-live` (storefront on `:3000`)
