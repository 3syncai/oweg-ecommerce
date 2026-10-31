# Meilisearch Product Search (QWEG Storefront)

**Date:** 2026-10-31  
**Status:** Approved for implementation  
**Decision:** Replace OpenSearch with self-hosted Meilisearch on the VPS.

## Goal

Amazon-like customer product search: typo tolerance, fast suggestions, category-scoped queries, and an up-to-date index of published/in-stock products.

## Architecture

```
Medusa (approve / publish / update / reject / delete)
        → upsert / delete document
Meilisearch (Docker on VPS)  index: products
        ← server-side search only
Next.js `/api/search` + Header suggestions + `/search` page
```

- Browser never calls Meilisearch directly.
- Master key stays on Medusa + Next.js server env only.

## Document shape

Reuse the existing `buildSearchDocument` fields: id, handle, title, subtitle, description, thumbnail, brand, category_ids, category_titles, collection_*, tags, price, mrp, discount, in_stock, rating, popularity_score, status, etc.

## Meilisearch settings

- **Searchable:** title, brand, category_titles, tags, subtitle, description
- **Filterable:** status, in_stock, category_ids, category_titles, collection_id, price, brand
- **Sortable:** price, rating, popularity_score
- **Ranking:** words, typo, proximity, attribute, sort, exactness + custom `in_stock:desc`, `popularity_score:desc`, `rating:desc`
- **Synonyms:** existing retail EN/IN synonym list from prior OpenSearch config

## Sync

| Event | Action |
|-------|--------|
| Admin approve / vendor publish / product.created|updated (published) | Upsert |
| Draft / reject / delete / vendor edit (pending) | Delete |
| Full reindex script | Delete all + re-add published products |

## Query API

`GET /api/search?q=&category=&categoryId=&page=&pageSize=`

Server filter always includes `status = published AND in_stock = true`, plus optional category/collection filters. Keep typo rewrite helper as a light pre-step.

## Ops (VPS)

Docker Compose service exposing Meilisearch (7700), `MEILI_MASTER_KEY` set, firewall restricted to app servers. Env:

- `MEILI_HOST` (e.g. `http://127.0.0.1:7700` or private IP)
- `MEILI_MASTER_KEY`
- `MEILI_PRODUCTS_INDEX=products` (optional)

## Out of scope

- Client-side Meilisearch keys
- OpenSearch compatibility layer (fully removed)
