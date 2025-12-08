// Clear Special Prices list and re-run migration
// Run: node clear-and-remigrate-discounts.js COOKIE

const mysql = require('mysql2/promise')

const cookie = process.argv[2] || ''
if (!cookie) {
  console.error('Usage: node clear-and-remigrate-discounts.js YOUR_COOKIE')
  process.exit(1)
}

const MEDUSA_URL = 'http://localhost:9000'
const PRICE_LIST_ID = 'plist_01KBXHWWX5X61GT1HYXKEP88SP'
const OPENCART = {
  host: '147.93.31.253',
  port: 3306,
  user: 'oweg_user2',
  password: 'Oweg#@123',
  database: 'oweg_db',
}

async function main() {
  console.log('\n🔄 CLEARING & RE-MIGRATING DISCOUNTS\n')

  try {
    // Step 1: Clear price list
    console.log('🗑️  Clearing Special Prices list...')
    const plRes = await fetch(`${MEDUSA_URL}/admin/price-lists/${PRICE_LIST_ID}`, {
      headers: { 'Cookie': cookie }
    })
    const plData = await plRes.json()
    const allPriceIds = plData.price_list.prices.map(p => p.id)
    console.log(`Found ${allPriceIds.length} prices to delete`)

    // Delete in batches of 500
    for (let i = 0; i < allPriceIds.length; i += 500) {
      const batch = allPriceIds.slice(i, i + 500)
      await fetch(`${MEDUSA_URL}/admin/price-lists/${PRICE_LIST_ID}/prices/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookie,
        },
        body: JSON.stringify({ delete: batch }),
      })
      console.log(`Deleted ${Math.min(i + 500, allPriceIds.length)}/${allPriceIds.length}`)
    }
    console.log('✅ Price list cleared!\n')

    // Step 2: Fetch special prices from OpenCart
    console.log('📡 Connecting to OpenCart...')
    const conn = await mysql.createConnection(OPENCART)
    const [rows] = await conn.execute(`
      SELECT p.product_id, pd.name, ps.price as special_price
      FROM oc_product p
      JOIN oc_product_description pd ON p.product_id = pd.product_id
      JOIN oc_product_special ps ON p.product_id = ps.product_id
      WHERE pd.language_id = 1
        AND ps.price > 0
        AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
        AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
      GROUP BY p.product_id
    `)
    console.log(`✅ Found ${rows.length} special prices\n`)

    // Step 3: Fetch Medusa products
    console.log('🔍 Fetching Medusa products...')
    const medusaProducts = await fetchAllMedusaProducts(cookie)
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`)

    // Step 4: Add prices to list
    console.log('💾 Adding special prices...\n')
    let batch = []
    let stats = { matched: 0, added: 0 }

    for (const row of rows) {
      const mp = medusaProducts.find(p => {
        if (p.metadata?.opencart_id == row.product_id) return true
        return p.title?.toLowerCase().trim() === row.name.toLowerCase().trim()
      })

      if (!mp?.variants?.[0]) continue

      stats.matched++
      batch.push({
        variant_id: mp.variants[0].id,
        currency_code: 'inr',
        amount: parseFloat(row.special_price), // Correct rupee amount
      })

      if (batch.length >= 100) {
        await addPricesToList(cookie, batch)
        stats.added += batch.length
        console.log(`✅ Added ${stats.added}/${stats.matched}...`)
        batch = []
      }
    }

    if (batch.length > 0) {
      await addPricesToList(cookie, batch)
      stats.added += batch.length
    }

    console.log('\n' + '='.repeat(60))
    console.log('🎉 COMPLETE!')
    console.log('='.repeat(60))
    console.log(`Special prices matched: ${stats.matched}`)
    console.log(`Added to price list:    ${stats.added}`)
    console.log('='.repeat(60))
    console.log('\n✅ Special Prices list is now clean and correct!\n')

    await conn.end()

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
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
  if (!res.ok) throw new Error(`Add prices failed: ${res.status}`)
}

main()
