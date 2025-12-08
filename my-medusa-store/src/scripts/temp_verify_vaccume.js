const fetch = require('node-fetch') // Or global if Node 18+

const MEDUSA_URL = 'http://localhost:9000'
// PASTE YOUR COOKIE HERE
const SESSION_COOKIE = 'connect.sid=s%3APQfb9xUk8U4LU1NsCuO_WBRV79KGX6ON.woc%2F5%2BYkNx90g0x0MgQzLrZC%2Bme4GoXoWk9O0JKjzfA' 

async function main() {
  try {
    console.log('Using provided session cookie...')
    
    // List products to verify auth
    const searchRes = await fetch(`${MEDUSA_URL}/admin/products?limit=5`, {
      headers: { 'Cookie': SESSION_COOKIE }
    })
    
    if (!searchRes.ok) {
       console.log(`❌ Auth failed: ${searchRes.status}`)
       return
    }

    const data = await searchRes.json()
    
    if (!data.products || data.products.length === 0) {
      console.log('❌ No products found (Auth issue?)')
      return
    }

    console.log(`✅ Auth successful. Found ${data.products.length} products.`)
    
    // Find Vaccume
    const product = data.products.find(p => p.title.toLowerCase().includes('vaccume') || p.title.toLowerCase().includes('vacuum')) || data.products[0]
    
    console.log(`Checking product: ${product.title} (ID: ${product.id})`)
    const variant = product.variants[0]
    const inrPrice = variant.prices.find(p => p.currency_code === 'inr')
    
    if (inrPrice) {
      console.log(`Current Price: ${inrPrice.amount}`)
      if (inrPrice.amount === 253) {
        console.log('⚠️  Price is incorrectly 253. Updating to 25300...')
        const updateRes = await fetch(`${MEDUSA_URL}/admin/products/variants/${variant.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': SESSION_COOKIE,
            },
            body: JSON.stringify({
              prices: [{ currency_code: 'inr', amount: 25300 }]
            }),
          })
          if (updateRes.ok) console.log('✅ Price updated to 25300')
          else console.log('❌ Update failed')
      } else {
        console.log('Price appears correct (or unexpected).')
      }
    }

  } catch (err) {
    console.error(err)
  }
}

main()
