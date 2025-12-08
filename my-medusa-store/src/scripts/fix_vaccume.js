const fetch = require('node-fetch') 
// If node-fetch is not available, we might need a different approach or rely on global fetch if Node 18+
// Given recent errors "fetch is not defined" implies we might be on older node or need require. 
// But previous scripts used require('node-fetch').

const MEDUSA_URL = 'http://localhost:9000'

async function main() {
  const cookieArg = process.argv[2]
  if (!cookieArg) {
    console.error('Please provide the cookie as an argument: node fix_vaccume.js "connect.sid=..."')
    process.exit(1)
  }

  // Ensure cookie format
  const sessionCookie = cookieArg.startsWith('connect.sid=') ? cookieArg : `connect.sid=${cookieArg}`
  
  console.log(' Using cookie:', sessionCookie)

  try {
    // 1. Search for the product
    console.log('🔍 Searching for "Vaccume"...')
    const searchRes = await fetch(`${MEDUSA_URL}/admin/products?q=Vaccume&limit=1`, {
      headers: { 'Cookie': sessionCookie }
    })

    if (!searchRes.ok) {
      console.error(`❌ Search failed: ${searchRes.status} ${await searchRes.text()}`)
      return
    }

    const data = await searchRes.json()
    const product = data.products?.[0]

    if (!product) {
      console.error('❌ Product "Vaccume" not found.')
      // List a few to verify we are authenticated and see ANYTHING
      const listRes = await fetch(`${MEDUSA_URL}/admin/products?limit=3`, {
          headers: { 'Cookie': sessionCookie }
      })
      const listData = await listRes.json()
      console.log('Available products:', listData.products?.map(p => p.title).join(', '))
      return
    }

    console.log(`✅ Found: ${product.title} (ID: ${product.id})`)
    const variant = product.variants[0]
    const inrPrice = variant?.prices?.find(p => p.currency_code === 'inr')

    if (!inrPrice) {
        console.log('❌ No INR price found on first variant.')
        return
    }

    console.log(`💰 Current Price in DB: ${inrPrice.amount}`)

    let targetAmount = 0
    if (inrPrice.amount === 253) {
        targetAmount = 25300
        console.log('⚠️  Price is incorrectly 253 (Major). Fixing to 25300 (Minor)...')
    } else if (inrPrice.amount === 25300) {
        console.log('✅ Price is already 25300. No action needed.')
        return
    } else {
        // Fallback: If it's something closely related like 253.00 or string
        console.log(`⚠️  Unexpected price. Force updating to 25300 just in case.`)
        targetAmount = 25300
    }

    // 2. Update the price
    const updateRes = await fetch(`${MEDUSA_URL}/admin/products/variants/${variant.id}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': sessionCookie,
        },
        body: JSON.stringify({
            prices: [{ currency_code: 'inr', amount: targetAmount }]
        }),
    })

    if (updateRes.ok) {
        console.log('✅ SUCCESS: Price updated to 25300')
    } else {
        console.error(`❌ Update failed: ${updateRes.status} ${await updateRes.text()}`)
    }

  } catch (err) {
    console.error('❌ Error:', err)
  }
}

main()
