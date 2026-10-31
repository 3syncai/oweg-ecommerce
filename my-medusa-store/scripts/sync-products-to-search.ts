import { getMeiliClient, waitForMeiliTask } from "../src/utils/meilisearch"
import {
  buildSearchDocument,
  ensureProductsIndex,
  getProductsIndexUid,
} from "../src/utils/search-index"

const BULK_BATCH_SIZE = 500

export default async function syncProducts({ container }) {
  const query = container.resolve("query")
  const client = getMeiliClient()
  const uid = getProductsIndexUid()

  // Fresh index so settings + docs stay consistent
  try {
    const deleteTask = await client.deleteIndex(uid)
    await waitForMeiliTask(client, deleteTask.taskUid, 120_000)
    console.log(`🗑️  Deleted old '${uid}' index`)
  } catch {
    console.log("No existing index to delete")
  }

  await ensureProductsIndex()
  console.log(`✅ Created fresh '${uid}' index`)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "subtitle",
      "description",
      "thumbnail",
      "status",
      "created_at",
      "updated_at",
      "metadata",
      "categories.id",
      "categories.title",
      "categories.name",
      "tags.value",
      "tags.handle",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.inventory_quantity",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.metadata",
      "collection_id",
      "collection.title",
    ],
    filters: {
      status: "published",
    },
  })

  console.log(`📦 Found ${products.length} published products`)

  if (products.length === 0) {
    console.log("⚠️  No published products found. Check your products in admin.")
    return
  }

  const index = client.index(uid)
  let count = 0
  let failed = 0

  for (let i = 0; i < products.length; i += BULK_BATCH_SIZE) {
    const batch = products.slice(i, i + BULK_BATCH_SIZE)
    const docs = batch.map((product: Record<string, unknown>) =>
      buildSearchDocument(product)
    )

    try {
      const task = await index.addDocuments(docs, { primaryKey: "id" })
      await waitForMeiliTask(client, task.taskUid, 120_000)
      count += docs.length
      console.log(`✅ Indexed batch ${i}-${i + docs.length - 1}`)
    } catch (err) {
      failed += batch.length
      console.error(`❌ Failed batch index (${i}-${i + batch.length - 1})`, err)
    }
  }

  console.log("─────────────────────────────────")
  console.log(`✅ Sync complete: ${count} indexed, ${failed} failed`)
  console.log("─────────────────────────────────")
}
