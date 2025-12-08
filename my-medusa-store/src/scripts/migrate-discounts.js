// DISCOUNT PRICE MIGRATION SCRIPT
// This migrates special/discounted prices from OpenCart to Medusa Price List
// 
// INSTRUCTIONS:
// 1. Get fresh cookie from browser: DevTools → Application → Cookies → connect.sid
// 2. Replace YOUR_COOKIE below with the actual value
// 3. Run: node -e "..." (command will be provided)

require('dotenv/config')
const mysql = require('mysql2/promise')

const MEDUSA_URL = 'http://localhost:9000'
const SESSION_COOKIE = 'connect.sid=s%3AGrKn7JFtjrwzhJbL8vpkrym3_PDrsnNb.YTkIO%2FpGEGa%2BbQmRVNjpQBP1KbYGTBYe%2BHjNr5Zqu%2FU'

const OPENCART = {
  host: '147.93.31.253',
  port: 3306,
  user: 'oweg_user2',
  password: 'Oweg#@123',
  database: 'oweg_db',
}

async function main() {
  console.log('\n🔄 DISCOUNT MIGRATION - Adding special prices to Medusa\n')

  let conn = null
  const stats = { total: 0, matched: 0, updated: 0, errors: 0 }

  try {
    // Connect to OpenCart
    console.log('📡 Connecting to OpenCart...')
    conn = await mysql.createConnection(OPENCART)
    console.log('✅ Connected\n')

    // Fetch special prices
    console.log('📊 Fetching special prices from OpenCart...')
    const [rows] = await conn.execute(`
      SELECT 
        p.product_id,
        pd.name,
        p.price as base_price,
        ps.price as special_price
      FROM oc_product p
      INNER JOIN oc_product_description pd ON p.product_id = pd.product_id
      INNER JOIN oc_product_special ps ON p.product_id = ps.product_id
      WHERE pd.language_id = 1
        AND ps.price > 0
        AND (ps.date_start = '0000-00-00' OR ps.date_start <= NOW())
        AND (ps.date_end = '0000-00-00' OR ps.date_end >= NOW())
      GROUP BY p.product_id
    `)
    stats.total = rows.length
    console.log(`✅ Found ${rows.length} products with special prices\n`)

    // Fetch Medusa products
    console.log('🔍 Fetching Medusa products...')
    const medusaProducts = await fetchAllMedusaProducts()
    console.log(`✅ Found ${medusaProducts.length} Medusa products\n`)

    // Check if "Special Prices" price list exists, create if not
    console.log('🏷️  Setting up Price List...')
    const priceList = await getOrCreatePriceList()
    console.log(`✅ Using price list: ${priceList.id}\n`)

    console.log('💾 Adding discounted prices...\n')

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
      const variantId = mp.variants[0].id
      const priceInCents = Math.round(specialPrice * 100)

      try {
        await addPriceToList(priceList.id, variantId, priceInCents)
        stats.updated++
        if (stats.updated % 50 === 0) {
          console.log(`✅ Added ${stats.updated}/${stats.matched} discounts...`)
        }
      } catch (err) {
        stats.errors++
      }
    }

    console.log('\n' + '='.repeat(70))
    console.log('🎉 DISCOUNT MIGRATION COMPLETE!')
    console.log('='.repeat(70))
    console.log(`Total special prices:     ${stats.total}`)
    console.log(`Matched with Medusa:      ${stats.matched}`)
    console.log(`Successfully added:       ${stats.updated}`)
    console.log(`Errors:                   ${stats.errors}`)
    console.log('='.repeat(70))
    console.log('\n✅ All discounts added to Medusa Price List!\n')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
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
    
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)

    const data = await res.json()
    if (!data.products?.length) break
    products.push(...data.products)
    offset += 100
    if (data.products.length < 100) break
  }

  return products
}

async function getOrCreatePriceList() {
  // Try to find existing "Special Prices" list
  const res = await fetch(`${MEDUSA_URL}/admin/price-lists?title=Special Prices`, {
    headers: { 'Cookie': SESSION_COOKIE }
  })

  const data = await res.json()
  
  if (data.price_lists?.length > 0) {
    return data.price_lists[0]
  }

  // Create new price list
  const createRes = await fetch(`${MEDUSA_URL}/admin/price-lists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': SESSION_COOKIE,
    },
    body: JSON.stringify({
      title: 'Special Prices',
      description: 'Discounted prices from OpenCart',
      type: 'sale',
      status: 'active',
    }),
  })

  if (!createRes.ok) throw new Error(`Failed to create price list: ${createRes.status}`)
  
  const createData = await createRes.json()
  return createData.price_list
}

async function addPriceToList(priceListId, variantId, amountInCents) {
  const url = `${MEDUSA_URL}/admin/price-lists/${priceListId}/prices/batch`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': SESSION_COOKIE,
    },
    body: JSON.stringify({
      prices: [{
        variant_id: variantId,
        currency_code: 'inr',
        amount: amountInCents,
      }]
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

main()
