import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import client from "../utils/opensearch"
import {
    PRODUCTS_INDEX,
    buildSearchDocument,
    ensureProductsIndex,
} from "../utils/search-index"

export default async function productUpdatedHandler({
    event,
    container,
}: SubscriberArgs<{ id: string }>) {

    console.log("🟡 Product updated event triggered:", event.data.id)

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

        // ✅ If published → index it (add or update)
        if (product.status === "published") {
            await ensureProductsIndex()
            const doc = buildSearchDocument(product as unknown as Record<string, any>)
            await client.index({
                index: PRODUCTS_INDEX,
                id: product.id,
                refresh: true,
                body: doc,
            })
            console.log("✅ Product indexed/updated in OpenSearch:", product.title)
        }

        // ✅ If changed back to draft → remove from index
        else {
            try {
                await client.delete({
                    index: PRODUCTS_INDEX,
                    id: product.id,
                    refresh: true,
                })
                console.log("🗑️ Draft product removed from OpenSearch:", product.title)
            } catch (err: any) {
                // Product wasn't in index — that's fine
                if (err?.meta?.statusCode === 404) {
                    console.log("⏭️ Product was not in index, nothing to delete")
                } else {
                    throw err
                }
            }
        }

    } catch (error) {
        console.error("❌ Error handling product update:", error)
        throw error
    }
}

export const config: SubscriberConfig = {
    event: "product.updated",
}
