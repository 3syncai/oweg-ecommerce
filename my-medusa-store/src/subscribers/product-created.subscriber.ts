import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import client from "../utils/opensearch"
import {
    PRODUCTS_INDEX,
    buildSearchDocument,
    ensureProductsIndex,
} from "../utils/search-index"

export default async function productCreatedHandler({
    event,
    container,
}: SubscriberArgs<{ id: string }>) {

    console.log("🟡 Product created event triggered:", event.data.id)

    try {
        const productService = container.resolve("productService")

        const product = await productService.retrieve(event.data.id, {
            relations: [
                "variants",
                "variants.prices",
                "variants.options",
                "collection",
                "categories",
                "tags",
            ],
        })

        console.log("🟡 Product fetched:", product.title, "| Status:", product.status)

        // ✅ Only index published products
        if (product.status !== "published") {
            console.log(`⏭️ Skipping — product is in draft: ${product.title}`)
            return
        }

        await ensureProductsIndex()
        const doc = buildSearchDocument(product as unknown as Record<string, any>)

        await client.index({
            index: PRODUCTS_INDEX,
            id: product.id,
            refresh: true,
            body: doc,
        })

        console.log("🔥 Product indexed in OpenSearch:", product.title)

    } catch (error) {
        console.error("❌ Error indexing product:", error)
        throw error
    }
}

export const config: SubscriberConfig = {
    event: "product.created",
}
