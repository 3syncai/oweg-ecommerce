# Order ETL - OpenCart to Medusa

This directory contains scripts to migrate orders from OpenCart MySQL to Medusa PostgreSQL.

## Structure

- `extract.js` - Extracts orders from OpenCart MySQL and transforms to JSON format
- `exports/` - Directory for JSON output (contains `medusa-orders-50.json`)
- Load script is in `my-medusa-store/src/scripts/load-opencart-orders.ts`

## Usage

### Step 1: Extract Orders (50 orders limit for initial testing)

```bash
cd etl/orders
node extract.js
```

This will:
- Connect to OpenCart MySQL
- Extract first 50 orders with all related data
- Transform to Medusa format
- Save to `exports/medusa-orders-50.json`

### Step 2: Load Orders into Medusa

```bash
cd my-medusa-store
npx medusa exec ./src/scripts/load-opencart-orders.ts
```

This will:
- Read the JSON file
- Create customers (if needed)
- Create addresses
- Create orders with line items
- **ONLY touches order-related tables**: `order`, `order_line_item`, `customer`, `address`

## Safety

- ✅ Only reads from OpenCart (no writes)
- ✅ Only creates orders in Medusa (no updates to existing data)
- ✅ Creates customers/addresses if needed (safe, idempotent)
- ✅ Limited to 50 orders initially for testing
- ✅ All operations are logged

## Environment Variables

Required in `.env` or environment:

```bash
# OpenCart MySQL
OPENCART_DB_HOST=<your_host>
OPENCART_DB_PORT=3306
OPENCART_DB_USER=<your_user>
OPENCART_DB_PASSWORD=<your_password>
OPENCART_DB_NAME=<your_db_name>

# Medusa (for load script)
DATABASE_URL=postgresql://...
```

## Current Status

- ✅ Extract script: Working (50 orders extracted)
- ✅ Load script: Ready (TypeScript, proper export format)
- ✅ JSON file: Generated (`exports/medusa-orders-50.json`)

## Next Steps

1. Run the load script to test with 50 orders
2. Verify in Medusa admin
3. If successful, increase limit and run full migration

