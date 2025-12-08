// FIX BASE PRICES - Remove 100x multiplication
// Run: node fix-base-prices.js COOKIE

const mysql = require('mysql2/promise')

const cookie = process.argv[2] || ''
if (!cookie) {
  console.error('Usage: node fix-base-prices.js YOUR_COOKIE')
  process.exit(1)
}

const MEDUSA_URL = 'http://localhost:9000'
const OPENCART = {
  host: '147.93.31.253',
  port: 3306,
  user: 'oweg_user2',
  password: 'Oweg#@123',
  database: 'oweg_db',
}

async function main() {
  console.log('\n🔄 Fixing Base Prices (removing 100x error)\n')
  
  let conn = null
  let stats = { total: 0, matched: 0, updated: 0 }

  try {
    conn = await mysql.createConnection(OPENCART)
    console.log('✅ Connected to OpenCart\n')

    const [rows] = await conn.execute(`
      SELECT p.product_id, pd.name, p.price
      FROM oc_product p
      JOIN oc_product_description pd ON p.product_id = pd.product_id
      WHERE pd.language_id = 1 AND p.price > 0
      ORDER BY p.product_id
    `)
    stats.total = rows.length
    console.log(`✅ Found ${rows.length} products\n`)

    console.log('🔍 Fetching Medusa products...')
    const medusaProducts = await fetchAllMedusaProducts(cookie)
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`)

    console.log('💾 Updating prices...\n')

    for (const row of rows) {
      const mp = medusaProducts.find(p => {
        if (p.metadata?.opencart_id == row.product_id) return true
        return p.title?.toLowerCase().trim() === row.name.toLowerCase().trim()
      })

      if (!mp?.variants?.[0]) continue

      stats.matched++
      const variantId = mp.variants[0].id
      const correctPrice = parseFloat(row.price) // NO multiplication!

      await updateVariantPrice(cookie, variantId, correctPrice)
      stats.updated++
      
      if (stats.updated % 50 === 0) {
        console.log(`✅ ${stats.updated}/${stats.matched}...`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ BASE PRICES FIXED!')
    console.log('='.repeat(60))
    console.log(`Total products:    ${stats.total}`)
    console.log(`Matched & updated: ${stats.updated}`)
    console.log('='.repeat(60) + '\n')

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

async function updateVariantPrice(cookie, variantId, amount) {
  const url = `${MEDUSA_URL}/admin/products/variants/${variantId}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
    },
    body: JSON.stringify({
      prices: [{ currency_code: 'inr', amount: amount }] // Correct rupee amount
    }),
  })
  if (!res.ok) throw new Error(`Update failed: ${res.status}`)
}

main()
