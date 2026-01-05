<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa
</h1>

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Building blocks for digital commerce
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
    <a href="https://www.producthunt.com/posts/medusa"><img src="https://img.shields.io/badge/Product%20Hunt-%231%20Product%20of%20the%20Day-%23DA552E" alt="Product Hunt"></a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

## Compatibility

This starter is compatible with versions >= 2 of `@medusajs/medusa`. 

## Getting Started

Visit the [Quickstart Guide](https://docs.medusajs.com/learn/installation) to set up a server.

Visit the [Docs](https://docs.medusajs.com/learn/installation#get-started) to learn more about our system requirements.

## What is Medusa

Medusa is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

Learn more about [Medusa’s architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules) in the Docs.

## Community & Contributions

The community and core team are available in [GitHub Discussions](https://github.com/medusajs/medusa/discussions), where you can ask for support, discuss roadmap, and share ideas.

Join our [Discord server](https://discord.com/invite/medusajs) to meet other community members.

## Other channels

- [GitHub Issues](https://github.com/medusajs/medusa/issues)
- [Twitter](https://twitter.com/medusajs)
- [LinkedIn](https://www.linkedin.com/company/medusajs)
- [Medusa Blog](https://medusajs.com/blog/)

## OpenCart → Medusa ETL Toolkit

This project ships with an ETL toolkit that discovers your OpenCart schema, backs up data, uploads images to object storage, stages products inside Medusa, and produces verification artefacts.

### Prerequisites

Set the following environment variables (locally or in the process manager that launches the ETL):

- `SOURCE_MYSQL` – OpenCart MySQL connection string (read-only user recommended)
- `TARGET_POSTGRES` – Medusa Postgres connection string
- `OBJECT_STORAGE_PROVIDER` – `s3`, `r2`, or `gcs`
- `OBJECT_STORAGE_BUCKET` – bucket name to store product imagery
- `OBJECT_STORAGE_BASE_PATH` – optional prefix inside the bucket
- `MEDUSA_ADMIN_API` – Medusa admin base URL (e.g. `https://medusa.example.com/admin`)
- `MEDUSA_ADMIN_TOKEN` – Medusa admin API token
- `MEDUSA_LOCATION_ID` – stock location used for inventory levels
- `OPENCART_ETL_DRY_RUN` – `true` to simulate migration without writes
- `OPENCART_ETL_DATA_DIR` – optional path for backups/checkpoints (defaults to `logs/opencart-etl`)
- `OC_IMAGE_BASE_URL` – absolute base URL for OpenCart product imagery (used to resolve relative paths)
- `OC_BASE_URL` – canonical OpenCart storefront host (used to build absolute URLs when paths are incomplete)
- `HTTP_REFERER` – optional referer header for image requests (defaults to `OC_BASE_URL`)
- `PLACEHOLDER_URL` – fallback image served when catalogue assets are missing
- `CONCURRENCY` – number of concurrent image resolution checks (`resolveImageUrl` helper)

Install dependencies:

```bash
npm install
```

### ETL Toolkit API Endpoints

- `GET /discover` – discover OpenCart tables and produce `mapping.json`
- `POST /export` – back up specific tables to CSV (+ schema SQL) with SHA256 hashes
- `GET /job/{id}/status` – monitor job state, errors, artefact paths, progress
- `POST /migrate` – execute resumable migration with checkpointing and optional dry-run
- `GET /report/{id}` – generate the latest report (JSON by default, `?format=csv` streams a downloadable CSV)

Persisted artefacts are stored under `logs/opencart-etl/` by default:

- `backups/` – compressed CSV exports + schema definitions
- `jobs/` – job metadata, progress snapshots, and generated `mapping.json` files per job
- `checkpoints/` – resumable migration checkpoints
- `reports/` – verification summaries keyed by job ID (retrievable via `GET /report/{id}` and downloadable with `GET /report/{id}?format=csv`)

Pre-run checklist:

- [ ] Confirm `SOURCE_MYSQL` is read-only and points to the correct store
- [ ] Provision the object storage bucket and scoped IAM credentials
- [ ] Configure `MEDUSA_ADMIN_API` & `MEDUSA_ADMIN_TOKEN` against a test environment
- [ ] Set and verify `OC_IMAGE_BASE_URL` resolves to original OpenCart product imagery
- [ ] Validate `OC_BASE_URL`, `HTTP_REFERER`, and `PLACEHOLDER_URL` return 200 responses
- [ ] Ensure backups directory has sufficient space; verify SHA256 hashes post-export
- [ ] Tune `OPENCART_ETL_BATCH_SIZE` and concurrency based on environment capacity
- [ ] Execute a dry-run (`OPENCART_ETL_DRY_RUN=true`) and review staged products + images
- [ ] Call `GET /report/{jobId}` (and `/report/{jobId}?format=csv`) during dry-run to validate report contents and downloads
- [ ] Schedule the full migration window and enable monitoring (`GET /job/{id}/status`)
- [ ] Confirm backup retention/cleanup strategy post-migration (delete or archive `backups/`, `reports/`, and related artefacts when safe)

### Image resolution & fallbacks

- All OpenCart image paths are normalised, percent-encoded, and validated with `HEAD`/`Range` requests before being handed to Medusa.
- Missing originals under `/image/catalog/...` automatically fall back to cached thumbnails under `/image/cache/catalog/...` for the common size suffixes (`1000x1000`, `800x800`, `600x600`, `500x500`, `300x300`) and allowed extensions (`jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`).
- If neither the original nor cache derivatives exist, the pipeline logs the event and uses `PLACEHOLDER_URL` so no product blocks the migration.
- Resolved URLs are deduplicated, capped to eight per product, and the first entry is always submitted as the Medusa thumbnail.
