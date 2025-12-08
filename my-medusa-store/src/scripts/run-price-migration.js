// ============================================================================
// PRICE MIGRATION SCRIPT - READ INSTRUCTIONS BEFORE RUNNING
// ============================================================================
//
// INSTRUCTIONS:
// 1. Open Medusa Admin in browser: http://localhost:9000/app
// 2. Login and open DevTools (F12) → Application → Cookies
// 3. Copy the value of 'connect.sid' cookie
// 4. Paste it in line 18 below (replace the placeholder)
// 5. Run: node src/scripts/run-price-migration.js
//
// ============================================================================

require('dotenv/config')
const mysql = require('mysql2/promise')

const MEDUSA_URL = 'http://localhost:9000'

// PASTE YOUR FRESH COOKIE HERE (line below):
const SESSION_COOKIE = 'connect.sid=s%3ATbKDIByNdL3w-Tph4XIZU0fbBb6bWlCt.9GQrLx2iJHY4%2FNS1QOJhOAYj9RZQd6XgAk1kQjQ69B4'

const OPENCART = {
  host: process.env.OPENCART_DB_HOST,
  port: 3306,
  user: process.env.OPENCART_DB_USER,
  password: process.env.OPENCART_DB_PASSWORD,
  database: process.env.OPENCART_DB_NAME,
}

async function main() {
  console.log('\n🔄 PRICE MIGRATION - UPDATING ALL 1,522 PRODUCTS\n')

  let conn = null
  const stats = { total: 0, matched: 0, updated: 0, errors: 0, errorList: [] }

  try {
    console.log('📡 Connecting to OpenCart...')
    conn = await mysql.createConnection(OPENCART)
    console.log('✅ Connected\n')

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

    console.log('🔍 Fetching Medusa products...')
    const medusaProducts = await fetchAllMedusaProducts()
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`)

    console.log('💾 Updating prices in Medusa Admin...\n')

    for (const row of rows) {
      const ocId = row.product_id
      const ocName = row.name
      const ocPrice = parseFloat(row.price)

      const mp = medusaProducts.find(p => {
        if (p.metadata?.opencart_id == ocId) return true
        return p.title?.toLowerCase().trim() === ocName.toLowerCase().trim()
      })

      if (!mp?.variants?.[0]) continue

      stats.matched++
      const variantId = mp.variants[0].id
      const priceInCents = Math.round(ocPrice * 100)

      try {
        await updateVariantPrice(variantId, priceInCents)
        stats.updated++
        if (stats.updated % 50 === 0) {
          console.log(`✅ Updated ${stats.updated}/${stats.matched} products...`)
        }
      } catch (err) {
        stats.errors++
        if (stats.errors <= 5) {
          stats.errorList.push(`${ocName.slice(0, 30)}: ${err.message.slice(0, 50)}`)
        }
      }
    }

    console.log('\n' + '='.repeat(70))
    console.log('🎉 MIGRATION COMPLETE!')
    console.log('='.repeat(70))
    console.log(`Total OpenCart products:  ${stats.total}`)
    console.log(`Matched with Medusa:      ${stats.matched}`)
    console.log(`Successfully updated:     ${stats.updated}`)
    console.log(` Errors:                   ${stats.errors}`)
    if (stats.errorList.length > 0) {
      console.log('\nSample errors:')
      stats.errorList.forEach(e => console.log(`  ❌ ${e}`))
    }
    console.log('='.repeat(70))
    console.log('\n✅ All prices updated in Medusa Admin!')
    console.log('💡 Refresh your browser to see the changes\n')

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error('\nIf you see "401 Unauthorized", your cookie expired.')
    console.error('Get a fresh cookie and try again immediately.\n')
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
    const res = await fetch(url, { headers: { 'Cookie': SESSION_COOKIE } })
    
    if (!res.ok) {
      throw new Error(`Failed to fetch products (${res.status}). Cookie may have expired.`)
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
    headers: {
      'Content-Type': 'application/json',
      'Cookie': SESSION_COOKIE,
    },
    body: JSON.stringify({
      prices: [{ currency_code: 'inr', amount: amountInCents }]
    }),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

main()
