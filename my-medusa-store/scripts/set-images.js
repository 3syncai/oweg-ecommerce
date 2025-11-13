// set-images.js (Node 18+)
// Usage: FILE_BASE_URL=... MEDUSA_URL=... MEDUSA_ADMIN_BASIC=... node set-images.js

import 'dotenv/config'

// --- ENV ---
const FILE_BASE_URL = process.env.FILE_BASE_URL // e.g. https://oweg-media-mumbai-krj-2025.s3.ap-south-1.amazonaws.com
const MEDUSA_URL    = process.env.MEDUSA_URL    || 'http://localhost:9000'
const ADMIN_BASIC   = process.env.MEDUSA_ADMIN_BASIC // the same value you use in PowerShell: Authorization = "Basic <secret>"
const ADMIN_TOKEN   = process.env.MEDUSA_ADMIN_TOKEN // optional fallback (x-medusa-access-token)

if (!FILE_BASE_URL || !MEDUSA_URL || (!ADMIN_BASIC && !ADMIN_TOKEN)) {
  throw new Error('Missing env: FILE_BASE_URL, MEDUSA_URL, and either MEDUSA_ADMIN_BASIC or MEDUSA_ADMIN_TOKEN')
}

function adminHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (ADMIN_BASIC) h['Authorization'] = `Basic ${ADMIN_BASIC}`
  else h['x-medusa-access-token'] = ADMIN_TOKEN
  return h
}

async function headOk(url) {
  const r = await fetch(url, { method: 'HEAD' })
  return r.ok
}

async function s3UrlsForOpenCartId(ocId, max = 10) {
  const urls = []
  for (let i = 0; i < max; i++) {
    const u = `${FILE_BASE_URL}/opencart/oc_product_image_${ocId}_${i}.jpg`
    if (await headOk(u)) urls.push(u)
    else if (i === 0) break // none at all
  }
  return urls
}

async function getOneProductWithOcId() {
  const r = await fetch(`${MEDUSA_URL}/admin/products?limit=100`, { headers: adminHeaders() })
  if (!r.ok) throw new Error(`Admin products fetch failed: ${r.status}`)
  const data = await r.json()
  const p = (data.products || []).find(
    (x) => x.metadata?.opencart_id || x.metadata?.oc_product_id
  )
  if (!p) throw new Error('No product with metadata.opencart_id/oc_product_id found')
  const ocId = String(p.metadata.opencart_id || p.metadata.oc_product_id)
  return { productId: p.id, ocId, title: p.title }
}

async function updateImages(productId, urls) {
  const body = { images: urls.map((u) => ({ url: u })), thumbnail: urls[0] }
  const r = await fetch(`${MEDUSA_URL}/admin/products/${productId}`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Update failed ${r.status}: ${JSON.stringify(j).slice(0,200)}`)
  return j?.product?.images?.length || 0
}

async function main() {
  console.log('🔎 Picking one Medusa product that has OpenCart metadata…')
  const { productId, ocId, title } = await getOneProductWithOcId()
  console.log(`   → ${productId} | OC #${ocId} | ${title}`)

  console.log('🧪 Probing S3 for image keys…')
  const urls = await s3UrlsForOpenCartId(ocId, 10)
  if (!urls.length) throw new Error(`No S3 images found for ocId=${ocId}`)
  console.log(`   ✓ Found ${urls.length} image(s). First: ${urls[0]}`)

  console.log('🖼️  Updating Medusa product images…')
  const count = await updateImages(productId, urls)
  console.log(`   ✅ Updated. Medusa now has ${count} image(s) for ${productId}`)
}

main().catch((e) => {
  console.error('❌', e.message)
  process.exit(1)
})

