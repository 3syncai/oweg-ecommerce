import client from "../src/utils/opensearch"
import {
    PRODUCTS_INDEX,
    buildSearchDocument,
    createProductsIndexBody,
} from "../src/utils/search-index"

const BULK_BATCH_SIZE = 500

export default async function syncProducts({ container }) {

    const query = container.resolve("query")

    // ── Step 1: Delete existing index to start fresh ──
    try {
        const exists = await client.indices.exists({ index: PRODUCTS_INDEX })
        if (exists.body) {
            await client.indices.delete({ index: PRODUCTS_INDEX })
            console.log(`🗑️  Deleted old '${PRODUCTS_INDEX}' index`)
        }
    } catch (err) {
        console.log("No existing index to delete")
    }

    // ── Step 2: Create index with richer mappings/analyzers ──
    await client.indices.create({
        index: PRODUCTS_INDEX,
        body: createProductsIndexBody() as any,
    })
    console.log(`✅ Created fresh '${PRODUCTS_INDEX}' index`)

    // ── Step 3: Fetch ONLY published products ──
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
            status: "published",   // ← drafts excluded
        },
    })

    console.log(`📦 Found ${products.length} published products`)

    if (products.length === 0) {
        console.log("⚠️  No published products found. Check your products in admin.")
        return
    }

    // ── Step 4: Bulk index published products ──
    let count = 0
    let failed = 0

    for (let i = 0; i < products.length; i += BULK_BATCH_SIZE) {
        const batch = products.slice(i, i + BULK_BATCH_SIZE)
        const body: any[] = []

        for (const product of batch) {
            const doc = buildSearchDocument(product)
            body.push({ index: { _index: PRODUCTS_INDEX, _id: doc.id } })
            body.push(doc)
        }

        try {
            const bulkRes = await client.bulk({
                index: PRODUCTS_INDEX,
                refresh: false,
                body,
            })

            const items = ((bulkRes as any).body?.items || (bulkRes as any).items || []) as any[]
            if (!items.length) {
                count += batch.length
                continue
            }

            for (let j = 0; j < items.length; j++) {
                const item = items[j]?.index
                const product = batch[j]
                if (item?.error) {
                    failed++
                    console.error(`❌ Failed to index: ${product?.title || product?.id}`, item.error)
                } else {
                    count++
                }
            }
        } catch (err) {
            failed += batch.length
            console.error(`❌ Failed batch index (${i}-${i + batch.length - 1})`, err)
        }
    }

    await client.indices.refresh({ index: PRODUCTS_INDEX })

    console.log("─────────────────────────────────")
    console.log(`✅ Sync complete: ${count} indexed, ${failed} failed`)
    console.log("─────────────────────────────────")
}
