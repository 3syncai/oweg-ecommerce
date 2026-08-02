# OWEG Customer Groups — local vs live

## Why local shows groups but live may not

| | Local | Live |
|---|---|---|
| Code | `Krishnachandra_jha` with grouping feature | Often still older Medusa deploy / `master` without `d44e17e` |
| Database | Migrated + `seed:customer-groups` already run | May never have been seeded |
| Surface | Medusa Admin `localhost:9000/app` | Medusa Admin on API host (not Vercel storefront) |

Vercel storefront deploy **does not** update Medusa Admin Customer Groups.

## Fix live (Medusa host)

Deploy Medusa from a branch that includes commits `d44e17e`+ (customer groups feature), then:

```bash
npm run migrate
npm run seed:customer-groups
npm run backfill:customer-groups
npm run heal:customer-consistency   # if needed
```

## Verify

1. Health: `GET https://<medusa-host>/health` → 200
2. Admin (login required): `https://<medusa-host>/app/customer-groups`
3. If the sidebar hides nested Customer Groups (dashboard patch), use that direct URL anyway.
4. Customer detail Network: `GET /admin/customers/<id>/grouping` → 200 + `customer_group`

## Same database

Storefront `DATABASE_URL` and Medusa `DATABASE_URL` must point at the same Postgres if signup assignment and Admin groups must match.
