import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { resolveColorImagesForValue } from "./variant-matrix"

export type VariantInventoryInput = {
  id?: string
  sku?: string | null
  manage_inventory?: boolean
  inventory_quantity?: number
}

export type ProductVariantMatrix = {
  options: Array<{ title: string; values: string[] }>
  variants: Array<{
    id: string
    title: string | null
    sku: string | null
    manage_inventory: boolean
    allow_backorder: boolean
    inventory_quantity: number | null
    price: number | null
    discounted_price: number | null
    option_values: Record<string, string>
  }>
}

export async function syncVariantInventoryLevels(
  req: MedusaRequest,
  variants: VariantInventoryInput[]
): Promise<void> {
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)

  const stockLocations = await stockLocationModule.listStockLocations({
    name: "Default Warehouse",
  })

  let defaultLocation = stockLocations?.[0]
  if (!defaultLocation) {
    const allLocations = await stockLocationModule.listStockLocations({})
    defaultLocation = allLocations?.[0]
  }

  if (!defaultLocation) {
    console.warn("No stock location found — skipping inventory sync")
    return
  }

  const query = req.scope.resolve("query")

  for (const variant of variants) {
    if (!variant.id) continue
    const manageInventory = variant.manage_inventory !== false
    const hasInventoryQuantity = typeof variant.inventory_quantity === "number"
    const inventoryQuantity = hasInventoryQuantity ? variant.inventory_quantity : 0

    if (!manageInventory) continue

    try {
      let inventoryItem: { id: string } | undefined

      const { data: variantWithInventory } = await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "sku",
          "inventory_items.inventory_item_id",
        ],
        filters: { id: variant.id },
      })

      const existingInventoryItemId =
        variantWithInventory?.[0]?.inventory_items?.[0]?.inventory_item_id

      if (existingInventoryItemId) {
        const existingItems = await inventoryModule.listInventoryItems({
          id: existingInventoryItemId,
        })
        inventoryItem = existingItems?.[0]
      }

      if (!inventoryItem && variant.sku) {
        const existingItems = await inventoryModule.listInventoryItems({
          sku: variant.sku,
        })
        inventoryItem = existingItems?.[0]
        if (inventoryItem) {
          const linkModule = req.scope.resolve(ContainerRegistrationKeys.LINK) as {
            create: (data: Record<string, unknown>) => Promise<unknown>
          }
          await linkModule.create({
            [Modules.PRODUCT]: { variant_id: variant.id },
            [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
          })
        }
      }

      if (!inventoryItem) {
        const created = await inventoryModule.createInventoryItems([
          { sku: variant.sku || undefined },
        ])
        inventoryItem = created[0]
        const linkModule = req.scope.resolve(ContainerRegistrationKeys.LINK) as {
          create: (data: Record<string, unknown>) => Promise<unknown>
        }
        await linkModule.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItem!.id },
        })
      }

      if (!inventoryItem) continue

      const existingLevels = await inventoryModule.listInventoryLevels({
        inventory_item_id: inventoryItem.id,
        location_id: defaultLocation.id,
      })

      if (existingLevels?.length) {
        if (hasInventoryQuantity) {
          await inventoryModule.updateInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: defaultLocation.id,
              stocked_quantity: inventoryQuantity,
            },
          ])
        }
      } else {
        await inventoryModule.createInventoryLevels([
          {
            inventory_item_id: inventoryItem.id,
            location_id: defaultLocation.id,
            stocked_quantity: inventoryQuantity,
          },
        ])
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Failed to sync inventory for variant ${variant.id}:`, message)
    }
  }
}

export async function fetchProductVariantMatrix(
  req: MedusaRequest,
  productId: string
): Promise<ProductVariantMatrix> {
  const knex = req.scope.resolve("__pg_connection__") as any

  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data: Array<Record<string, unknown>> }>
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "options.id",
      "options.title",
      "options.values.value",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.options.option.title",
      "variants.options.value",
    ],
    filters: { id: productId },
  })

  const product = products?.[0]
  const options =
    (product?.options as Array<{ title?: string; values?: Array<{ value?: string }> }> | undefined)?.map(
      (opt) => ({
        title: (opt.title || "Option").trim(),
        values: Array.from(
          new Set(
            (opt.values || [])
              .map((entry) => (entry.value || "").trim())
              .filter(Boolean)
          )
        ),
      })
    ) || []

  const rawVariants =
    (product?.variants as Array<{
      id?: string
      title?: string
      sku?: string
      manage_inventory?: boolean
      allow_backorder?: boolean
      options?: Array<{ value?: string; option?: { title?: string } }>
    }> | undefined) || []

  const variants: ProductVariantMatrix["variants"] = []

  for (const variant of rawVariants) {
    if (!variant.id) continue

    const optionValues: Record<string, string> = {}
    for (const entry of variant.options || []) {
      const title = entry.option?.title?.trim()
      const value = entry.value?.trim()
      if (title && value) optionValues[title] = value
    }

    const basePriceRow = await knex("product_variant_price_set as pvps")
      .leftJoin("price as p", "p.price_set_id", "pvps.price_set_id")
      .where("pvps.variant_id", variant.id)
      .whereNull("p.price_list_id")
      .orderByRaw("CASE WHEN LOWER(p.currency_code) = 'inr' THEN 0 ELSE 1 END")
      .first("p.amount")

    const discountedPriceRow = await knex("product_variant_price_set as pvps")
      .leftJoin("price as p", "p.price_set_id", "pvps.price_set_id")
      .where("pvps.variant_id", variant.id)
      .whereNotNull("p.price_list_id")
      .orderByRaw("CASE WHEN LOWER(p.currency_code) = 'inr' THEN 0 ELSE 1 END")
      .first("p.amount")

    let inventoryQuantity: number | null = null
    try {
      const { data: variantInventory } = await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "inventory_items.inventory.location_levels.stocked_quantity",
          "inventory_items.inventory.location_levels.location_id",
        ],
        filters: { id: variant.id },
      })

      const levels =
        (variantInventory?.[0]?.inventory_items as Array<{
          inventory?: { location_levels?: Array<{ stocked_quantity?: number }> }
        }> | undefined)?.flatMap(
          (item) => item.inventory?.location_levels || []
        ) || []

      if (levels.length) {
        inventoryQuantity = levels.reduce(
          (sum, level) => sum + (level.stocked_quantity || 0),
          0
        )
      }
    } catch {
      inventoryQuantity = null
    }

    variants.push({
      id: variant.id,
      title: variant.title || null,
      sku: variant.sku || null,
      manage_inventory: variant.manage_inventory !== false,
      allow_backorder: variant.allow_backorder === true,
      inventory_quantity: inventoryQuantity,
      price: basePriceRow?.amount != null ? Number(basePriceRow.amount) : null,
      discounted_price:
        discountedPriceRow?.amount != null ? Number(discountedPriceRow.amount) : null,
      option_values: optionValues,
    })
  }

  return { options, variants }
}

export async function syncVariantThumbnailsFromColorImages(
  req: MedusaRequest,
  productId: string,
  colorImages: Record<string, string[]>,
  visualOption: string
): Promise<void> {
  if (!productId || !visualOption || !Object.keys(colorImages).length) return

  const knex = req.scope.resolve("__pg_connection__") as any

  const query = req.scope.resolve("query")
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "options.value", "options.option.title"],
    filters: { product_id: productId },
  })

  for (const variant of variants || []) {
    const options = (variant as {
      options?: Array<{ value?: string; option?: { title?: string } }>
    }).options

    const visualValue = options?.find((opt) => opt.option?.title === visualOption)?.value
    if (!visualValue) continue

    const urls = resolveColorImagesForValue(visualValue, colorImages)
    const thumbnail = urls?.[0]
    if (!thumbnail) continue

    await knex("product_variant")
      .where({ id: (variant as { id: string }).id })
      .update({ thumbnail, updated_at: new Date() })
  }
}
