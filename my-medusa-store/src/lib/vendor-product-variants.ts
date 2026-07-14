import type { MedusaRequest } from "@medusajs/framework/http"
import {
  batchProductVariantsWorkflow,
  createProductOptionsWorkflow,
  deleteProductOptionsWorkflow,
  updateProductOptionsWorkflow,
} from "@medusajs/core-flows"
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

export type SyncMatrixOptionInput = {
  title: string
  values: string[]
}

export type SyncMatrixVariantInput = {
  id?: string
  title?: string
  sku?: string | null
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number
  price?: number
  discounted_price?: number | null
  options?: Record<string, string>
}

function optionComboKey(optionTitles: string[], values: Record<string, string>): string {
  return optionTitles.map((title) => `${title}=${(values[title] || "").trim()}`).join("|")
}

function mapVariantOptionValues(
  variant: {
    options?: Array<{ value?: string; option?: { title?: string } }>
  }
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of variant.options || []) {
    const title = entry.option?.title?.trim()
    const value = entry.value?.trim()
    if (title && value) map[title] = value
  }
  return map
}

/**
 * Sync product options + variant matrix (create/update/delete) for vendor product edits.
 * Used when a simple Default product gains Color/Size (or the matrix changes).
 */
export async function syncVendorProductOptionsAndVariants(
  req: MedusaRequest,
  productId: string,
  desiredOptions: SyncMatrixOptionInput[],
  desiredVariants: SyncMatrixVariantInput[]
): Promise<{ created_ids: string[]; updated_ids: string[]; deleted_ids: string[] }> {
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters: Record<string, unknown>
    }) => Promise<{ data: Array<Record<string, unknown>> }>
  }

  const cleanedOptions = desiredOptions
    .map((opt) => ({
      title: (opt.title || "").trim(),
      values: Array.from(
        new Set(
          (opt.values || [])
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
        )
      ),
    }))
    .filter((opt) => opt.title && opt.values.length)

  if (!cleanedOptions.length) {
    throw new Error("At least one product option with values is required")
  }

  if (!desiredVariants.length) {
    throw new Error("At least one variant is required")
  }

  const optionTitles = cleanedOptions.map((opt) => opt.title)

  for (const variant of desiredVariants) {
    const options = variant.options || {}
    for (const title of optionTitles) {
      if (!options[title]?.trim()) {
        throw new Error(
          `Variant "${variant.title || variant.sku || "untitled"}" is missing value for "${title}"`
        )
      }
    }
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "options.id",
      "options.title",
      "options.values.value",
      "variants.id",
      "variants.options.option.title",
      "variants.options.value",
    ],
    filters: { id: productId },
  })

  const product = products?.[0]
  const existingOptions =
    (product?.options as Array<{ id?: string; title?: string }> | undefined) || []
  const existingVariants =
    (product?.variants as Array<{
      id?: string
      options?: Array<{ value?: string; option?: { title?: string } }>
    }> | undefined) || []

  const existingOptionsByTitle = new Map(
    existingOptions
      .filter((opt) => opt.id && opt.title)
      .map((opt) => [opt.title!.trim().toLowerCase(), opt as { id: string; title: string }])
  )

  const keepOptionIds = new Set<string>()

  for (const desired of cleanedOptions) {
    const existing = existingOptionsByTitle.get(desired.title.toLowerCase())
    if (existing) {
      keepOptionIds.add(existing.id)
      await updateProductOptionsWorkflow(req.scope).run({
        input: {
          selector: { id: existing.id, product_id: productId },
          update: {
            title: desired.title,
            values: desired.values,
          },
        },
      })
    } else {
      const { result } = await createProductOptionsWorkflow(req.scope).run({
        input: {
          product_options: [
            {
              product_id: productId,
              title: desired.title,
              values: desired.values,
            },
          ],
        },
      })
      const createdId = Array.isArray(result) ? result[0]?.id : undefined
      if (createdId) keepOptionIds.add(createdId)
    }
  }

  const existingById = new Map<string, { id: string; options: Record<string, string> }>()
  const existingByCombo = new Map<string, { id: string; options: Record<string, string> }>()

  for (const variant of existingVariants) {
    if (!variant.id) continue
    const options = mapVariantOptionValues(variant)
    const entry = { id: variant.id, options }
    existingById.set(variant.id, entry)
    existingByCombo.set(optionComboKey(Object.keys(options).sort(), options), entry)
    // Also index by desired option title order for matching after option renames are rare
    existingByCombo.set(optionComboKey(optionTitles, options), entry)
  }

  const createPayload: Array<Record<string, unknown>> = []
  const updatePayload: Array<Record<string, unknown>> = []
  const claimedIds = new Set<string>()
  const inventoryTargets: VariantInventoryInput[] = []
  const salePriceByCombo = new Map<string, number>()

  for (const desired of desiredVariants) {
    const options = Object.fromEntries(
      optionTitles.map((title) => [title, (desired.options?.[title] || "").trim()])
    )
    const combo = optionComboKey(optionTitles, options)
    const title =
      (desired.title || "").trim() ||
      Object.values(options).join(" / ") ||
      "Variant"

    let match: { id: string; options: Record<string, string> } | null = null

    if (desired.id && existingById.has(desired.id)) {
      const byId = existingById.get(desired.id)!
      const sameCombo = optionComboKey(optionTitles, byId.options) === combo
      const overlappingMatch = optionTitles.every(
        (title) => !byId.options[title] || byId.options[title] === options[title]
      )
      const structureCompatible =
        optionTitles.length > 0 &&
        optionTitles.every((title) => title in byId.options) &&
        overlappingMatch
      if (sameCombo || structureCompatible) {
        match = byId
      }
    }

    if (!match) {
      match = existingByCombo.get(combo) || null
    }

    if (match && claimedIds.has(match.id)) {
      match = null
    }

    const price =
      typeof desired.price === "number" && Number.isFinite(desired.price) && desired.price > 0
        ? desired.price
        : undefined

    const prices = price
      ? [{ amount: price, currency_code: "inr" }]
      : undefined

    if (
      typeof desired.discounted_price === "number" &&
      Number.isFinite(desired.discounted_price) &&
      desired.discounted_price > 0
    ) {
      salePriceByCombo.set(combo, desired.discounted_price)
    }

    if (match && !claimedIds.has(match.id)) {
      claimedIds.add(match.id)
      updatePayload.push({
        id: match.id,
        title,
        sku: typeof desired.sku === "string" ? desired.sku.trim() || null : desired.sku,
        manage_inventory: desired.manage_inventory !== false,
        allow_backorder: desired.allow_backorder === true,
        options,
        ...(prices ? { prices } : {}),
      })
      inventoryTargets.push({
        id: match.id,
        sku: typeof desired.sku === "string" ? desired.sku : null,
        manage_inventory: desired.manage_inventory !== false,
        inventory_quantity:
          typeof desired.inventory_quantity === "number"
            ? desired.inventory_quantity
            : undefined,
      })
    } else {
      createPayload.push({
        product_id: productId,
        title,
        sku: typeof desired.sku === "string" ? desired.sku.trim() || undefined : undefined,
        manage_inventory: desired.manage_inventory !== false,
        allow_backorder: desired.allow_backorder === true,
        options,
        ...(prices ? { prices } : {}),
      })
    }
  }

  const deleteIds = existingVariants
    .map((variant) => variant.id)
    .filter((id): id is string => typeof id === "string" && !claimedIds.has(id))

  const { result: batchResult } = await batchProductVariantsWorkflow(req.scope).run({
    input: {
      create: createPayload as never,
      update: updatePayload as never,
      delete: deleteIds,
    },
  })

  const created =
    (batchResult as { created?: Array<{ id: string; options?: unknown }> })?.created || []
  const createdIds = created.map((variant) => variant.id).filter(Boolean)

  // Re-fetch to attach inventory + sale prices for newly created variants
  const matrixAfter = await fetchProductVariantMatrix(req, productId)
  for (const variant of matrixAfter.variants) {
    const combo = optionComboKey(optionTitles, variant.option_values || {})
    const desired = desiredVariants.find((row) => {
      const options = Object.fromEntries(
        optionTitles.map((title) => [title, (row.options?.[title] || "").trim()])
      )
      return optionComboKey(optionTitles, options) === combo
    })
    if (!desired) continue

    if (!inventoryTargets.some((row) => row.id === variant.id)) {
      inventoryTargets.push({
        id: variant.id,
        sku: desired.sku || variant.sku,
        manage_inventory: desired.manage_inventory !== false,
        inventory_quantity:
          typeof desired.inventory_quantity === "number"
            ? desired.inventory_quantity
            : undefined,
      })
    }
  }

  await syncVariantInventoryLevels(req, inventoryTargets)

  // Sale / discounted prices (price list) — same knex upsert path as PATCH
  const knex = req.scope.resolve("__pg_connection__") as any
  const pricingModule = req.scope.resolve(Modules.PRICING) as {
    listPriceLists?: (filters: { status: string[] }) => Promise<Array<{ id: string; title?: string }>>
  }

  let priceListId: string | null = null
  if (salePriceByCombo.size > 0 && typeof pricingModule.listPriceLists === "function") {
    const activePriceLists = await pricingModule
      .listPriceLists({ status: ["active"] })
      .catch((): Array<{ id: string; title?: string }> => [])
    const preferred =
      activePriceLists.find((pl) => (pl.title || "").toLowerCase().includes("india")) ||
      activePriceLists[0]
    priceListId = preferred?.id || null
  }

  if (priceListId) {
    for (const variant of matrixAfter.variants) {
      const combo = optionComboKey(optionTitles, variant.option_values || {})
      const saleAmount = salePriceByCombo.get(combo)
      if (saleAmount == null) continue

      const priceSetRow = await knex("product_variant_price_set")
        .where({ variant_id: variant.id })
        .first("price_set_id")
      if (!priceSetRow?.price_set_id) continue

      const existingRow = await knex("price")
        .where({
          price_set_id: priceSetRow.price_set_id,
          currency_code: "inr",
          price_list_id: priceListId,
        })
        .first("id")

      const now = new Date()
      if (existingRow?.id) {
        await knex("price")
          .where({ id: existingRow.id })
          .update({ amount: saleAmount, raw_amount: saleAmount, updated_at: now })
      } else {
        await knex("price").insert({
          id: `price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          price_set_id: priceSetRow.price_set_id,
          price_list_id: priceListId,
          currency_code: "inr",
          amount: saleAmount,
          raw_amount: saleAmount,
          min_quantity: 1,
          rules_count: 0,
          created_at: now,
          updated_at: now,
        })
      }
    }
  }

  // Delete obsolete options (e.g. Default) after variants no longer reference them
  const obsoleteOptionIds = existingOptions
    .map((opt) => opt.id)
    .filter((id): id is string => typeof id === "string" && !keepOptionIds.has(id))

  if (obsoleteOptionIds.length) {
    await deleteProductOptionsWorkflow(req.scope).run({
      input: { ids: obsoleteOptionIds },
    })
  }

  return {
    created_ids: createdIds,
    updated_ids: updatePayload.map((row) => String(row.id)),
    deleted_ids: deleteIds,
  }
}
