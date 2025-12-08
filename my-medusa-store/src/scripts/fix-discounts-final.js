// FINAL WORKING DISCOUNT MIGRATION
// Run with: node fix-discounts-final.js COOKIE_VALUE

const mysql = require('mysql2/promise')

const cookie = process.argv[2] || ''
if (!cookie) {
  console.error('Usage: node fix-discounts-final.js YOUR_COOKIE_VALUE')
  process.exit(1)
}

const MEDUSA_URL = 'http://localhost:9000'
const PRICE_LIST_ID = 'plist_01KBXHWWX5X61GT1HYXKEP88SP'

const OPENCART = {
  host: process.env.OPENCART_DB_HOST,
  port: 3306,
  user: process.env.OPENCART_DB_USER,
  password: process.env.OPENCART_DB_PASSWORD,
  database: process.env.OPENCART_DB_NAME,
}

async function main() {
  console.log('\n🔄 FINAL Discount Migration - Correct API Format\n')

  let conn = null
  let stats = { total: 0, matched: 0, added: 0, errors: 0 }

  try {
    // Connect
    console.log('📡 Connecting to OpenCart...')
    conn = await mysql.createConnection(OPENCART)
    console.log('✅ Connected\n')

    // Fetch special prices
    console.log('📊 Fetching special prices...')
    const [rows] = await conn.execute(`
      SELECT 
        p.product_id,
        pd.name,
        ps.price as special_price
      FROM oc_product p
      JOIN oc_product_description pd ON p.product_id = pd.product_id
      JOIN oc_product_special ps ON p.product_id = ps.product_id
      WHERE pd.language_id = 1
        AND ps.price > 0
        AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
        AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
      GROUP BY p.product_id
    `)
    stats.total = rows.length
    console.log(`✅ Found ${rows.length} special prices\n`)

    // Fetch Medusa products
    console.log('🔍 Fetching Medusa products...')
    const medusaProducts = await fetchAllMedusaProducts(cookie)
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`)

    // Add prices to price list in batches
    console.log('💾 Adding prices to price list...\n')
    let batch = []
    
    for (const row of rows) {
      const ocId = row.product_id
      const ocName = row.name
      const specialPrice = parseFloat(row.special_price)

      const mp = medusaProducts.find(p => {
        if (p.metadata?.opencart_id == ocId) return true
        return p.title?.toLowerCase().trim() === ocName.toLowerCase().trim()
      })

      if (!mp?.variants?.[0]) continue

      stats.matched++
      batch.push({
        variant_id: mp.variants[0].id,
        currency_code: 'inr',
        amount: specialPrice, // Medusa v2 uses major unit (rupees), not paise
      })

      if (batch.length >= 100) {
        await addPricesToList(cookie, batch)
        stats.added += batch.length
        console.log(`✅ Added ${stats.added}/${stats.matched}...`)
        batch = []
      }
    }

    // Add remaining
    if (batch.length > 0) {
      await addPricesToList(cookie, batch)
      stats.added += batch.length
    }

    console.log('\n' + '='.repeat(60))
    console.log('🎉 COMPLETE!')
    console.log('='.repeat(60))
    console.log(`Total special prices:  ${stats.total}`)
    console.log(`Matched with Medusa:   ${stats.matched}`)
    console.log(`Added to price list:   ${stats.added}`)
    console.log('='.repeat(60))
    console.log('\n✅ Refresh Medusa Admin to see all discounts!\n')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  } finally {
    if (conn) await conn.end()
  }
}

async function fetchAllMedusaProducts(cookie) {
  const products = []
  let offset = 0

  while (true) {
    const url = `${MEDUSA_URL}/admin/products?limit=100&offset=${offset}&fields=id,title,metadata,variants.id`
    const res = await fetch(url, { headers: { 'Cookie': cookie } })
    
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)

    const data = await res.json()
    if (!data.products?.length) break
    products.push(...data.products)
    offset += 100
    if (data.products.length < 100) break
  }

  return products
}

async function addPricesToList(cookie, batch) {
  const url = `${MEDUSA_URL}/admin/price-lists/${PRICE_LIST_ID}/prices/batch`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
    },
    body: JSON.stringify({ create: batch }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Add prices failed: ${res.status} - ${text.slice(0, 200)}`)
  }
}

main()
