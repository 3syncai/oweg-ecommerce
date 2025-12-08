// migrate-prices-now-cjs.js - CommonJS version
// Run: node src/scripts/migrate-prices-now-cjs.js --dry-run
//      node src/scripts/migrate-prices-now-cjs.js

require('dotenv/config')
const mysql = require('mysql2/promise')

const MEDUSA_URL = process.env.MEDUSA_URL || 'http://localhost:9000'
const ADMIN_TOKEN = process.env.MEDUSA_ADMIN_BASIC || process.env.MEDUSA_ADMIN_TOKEN

const OPENCART = {
  host: process.env.OPENCART_DB_HOST,
  port: 3306,
  user: process.env.OPENCART_DB_USER,
  password: process.env.OPENCART_DB_PASSWORD,
  database: process.env.OPENCART_DB_NAME,
}

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${ADMIN_TOKEN}`,
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  console.log(`\n🔄 Price Migration (${isDryRun ? 'DRY RUN' : 'LIVE'})\n`)

  let conn = null
  const stats = { total: 0, matched: 0, updated: 0, errors: 0, errorList: [] }

  try {
    //  Connect
    console.log('📡 Connecting to OpenCart...')
    conn = await mysql.createConnection(OPENCART)
    console.log('✅ Connected\n')

    // Fetch prices
    console.log('📊 Fetching OpenCart prices...')
    const [rows] = await conn.execute(`
      SELECT p.product_id, pd.name, p.price
      FROM oc_product p
      INNER JOIN oc_product_description pd ON p.product_id = pd.product_id
      WHERE pd.language_id = 1 AND p.price > 0
      ORDER BY p.product_id
    `)
    stats.total = rows.length
    console.log(`✅ Found ${rows.length} products\n`)

    // Fetch Medusa products
    console.log('🔍 Fetching Medusa products...')
    const medusaProducts = await fetchAllMedusaProducts()
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`)

    // Match and update
    console.log(`${isDryRun ? '🔍 Preview' : '💾 Updating'} prices...\n`)

    for (const row of rows) {
      const ocId = row.product_id
      const ocName = row.name
      const ocPrice = parseFloat(row.price)

      // Match
      const mp = medusaProducts.find(p => {
        if (p.metadata?.opencart_id == ocId) return true
        return p.title?.toLowerCase().trim() === ocName.toLowerCase().trim()
      })

      if (!mp?.variants?.[0]) continue

      stats.matched++
      const variantId = mp.variants[0].id
      const priceInCents = Math.round(ocPrice * 100)

      if (isDryRun) {
        if (stats.matched <= 20) {
          console.log(`${ocName.slice(0, 45).padEnd(47)} → ₹${ocPrice}`)
        }
        continue
      }

      // Update
      try {
        await updateVariantPrice(variantId, priceInCents)
        stats.updated++
        if (stats.updated % 50 === 0) {
          console.log(`✅ ${stats.updated}/${stats.matched}...`)
        }
      } catch (err) {
        stats.errors++
        if (stats.errors <= 5) {
          stats.errorList.push(`${ocName.slice(0, 30)}: ${err.message.slice(0, 50)}`)
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📈 Migration Summary')
    console.log('='.repeat(60))
    console.log(`Total OpenCart products: ${stats.total}`)
    console.log(`Matched with Medusa:     ${stats.matched}`)
    if (!isDryRun) {
      console.log(`Successfully updated:    ${stats.updated}`)
      console.log(`Errors:                  ${stats.errors}`)
      if (stats.errorList.length > 0) {
        console.log('\nSample errors:')
        stats.errorList.forEach(e => console.log(`  ❌ ${e}`))
      }
    }
    console.log('='.repeat(60) + '\n')

    if (isDryRun) {
      console.log('ℹ️  DRY RUN - Run without --dry-run to apply\n')
    } else {
      console.log('✅ MIGRATION COMPLETE!')
      console.log('💡 Refresh Medusa Admin to see all updated prices\n')
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    if (conn) await conn.end()
  }
}

async function fetchAllMedusaProducts() {
  const products = []
  let offset = 0

  while (true) {
    const url = `${MEDUSA_URL}/admin/products?limit=100&offset=${offset}&fields=id,title,metadata,variants.id`
    const res = await fetch(url, { headers: adminHeaders() })
    
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Failed to fetch products: ${res.status} - ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    if (!data.products?.length) break

    products.push(...data.products)
    offset += 100

    if (data.products.length < 100) break
  }

  return products
}

async function updateVariantPrice(variantId, amountInCents) {
  const url = `${MEDUSA_URL}/admin/products/variants/${variantId}`
  const res = await fetch(url, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      prices: [{ currency_code: 'inr', amount: amountInCents }]
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`)
  }

  return res.json()
}

main()
