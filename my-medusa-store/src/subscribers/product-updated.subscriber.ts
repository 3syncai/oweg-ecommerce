import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { deleteSearchDocument, upsertProductToSearch } from "../utils/search-index"

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

    if (product.status === "published") {
      await upsertProductToSearch(product as unknown as Record<string, any>)
      console.log("✅ Product indexed/updated in Meilisearch:", product.title)
    } else {
      try {
        await deleteSearchDocument(product.id)
        console.log("🗑️ Draft product removed from Meilisearch:", product.title)
      } catch (err: any) {
        const msg = String(err?.message || "")
        if (msg.includes("not found") || err?.code === 404) {
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
