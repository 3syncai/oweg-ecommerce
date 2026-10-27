import type { MedusaRequest } from "@medusajs/framework/http"
import { generateEntityId, MessageAggregator, Modules } from "@medusajs/framework/utils"
import { cleanVendorMetadata } from "./catalog-identity"
import { detectVisualOption, resolveColorImagesForValue, sanitizeColorImages } from "./variant-matrix"

export class ProductEditError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

// Medusa 2.11 module services accept a MikroORM transactionManager in their
// shared context. Bind each module's OWN manager to one Knex transaction so
// product/options, prices, inventory and links cannot commit independently.
class DeferredEditEvents extends MessageAggregator {
  count() { return 0 }
  pending() { return super.count() }
}

export function productEditContext(service: any, trx: any, events: DeferredEditEvents) {
  const manager = service.baseRepository_?.getFreshManager?.()
  if (!manager?.setTransactionContext) throw new Error("Product editing requires Medusa transaction context support")
  manager.setTransactionContext(trx)
  return { transactionManager: manager, messageAggregator: events }
}

function amount(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ProductEditError(`${name} must be greater than zero`)
  }
  return value
}
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key)

export async function saveVendorProductEdit(req: MedusaRequest, productId: string, vendorId: string, body: any) {
  const db = req.scope.resolve("__pg_connection__") as any
  const products = req.scope.resolve(Modules.PRODUCT) as any
  const inventory = req.scope.resolve(Modules.INVENTORY) as any
  const productEvents = new DeferredEditEvents()
  const inventoryEvents = new DeferredEditEvents()

  const saved = await db.transaction(async (trx: any) => {
    const stored = await trx("product").where({ id: productId }).whereNull("deleted_at").forUpdate().first()
    if (!stored) throw new ProductEditError("Product not found", 404)
    if (stored.metadata?.vendor_id !== vendorId) throw new ProductEditError("Product does not belong to this vendor", 403)
    const context = productEditContext(products, trx, productEvents)
    let inventoryContext: ReturnType<typeof productEditContext> | undefined
    const stockContext = () => inventoryContext ||= productEditContext(inventory, trx, inventoryEvents)
    const existing = await trx("product_variant").where({ product_id: productId }).whereNull("deleted_at").orderBy("created_at", "asc")
    const existingIds = new Set(existing.map((v: any) => v.id))
    const matrix = owns(body, "options")
    if (matrix && (!Array.isArray(body.options) || !body.options.length)) throw new ProductEditError("At least one option is required")
    if (body.variants !== undefined && (!Array.isArray(body.variants) || !body.variants.length)) throw new ProductEditError("At least one variant is required")
    if (matrix && !body.variants) throw new ProductEditError("Variant rows are required with options")

    const options: Array<{ title: string; values: string[] }> = (body.options || []).map((opt: any) => {
      if (typeof opt.title !== "string" || !opt.title.trim() || !Array.isArray(opt.values) || !opt.values.length || opt.values.some((v: unknown) => typeof v !== "string" || !v.trim())) {
        throw new ProductEditError("Each option needs a title and values")
      }
      return { title: opt.title.trim(), values: [...new Set<string>(opt.values.map((v: string) => v.trim()))] }
    })
    if (new Set(options.map(opt => opt.title.toLowerCase())).size !== options.length) throw new ProductEditError("Duplicate option titles")
    const rows = body.variants || ((owns(body, "price") || owns(body, "discounted_price")) ? [{ id: existing[0]?.id, price: body.price, ...(owns(body, "discounted_price") ? { discounted_price: body.discounted_price } : {}) }] : [])
    // Reuse the existing default variant when changing a one-row structure;
    // this preserves its price/inventory links rather than recreating it.
    if (matrix && rows.length === 1 && existing.length === 1 && !rows[0].id) rows[0].id = existing[0].id
    const combinations = new Set<string>()
    const skus = new Set<string>()
    const requestedIds = new Set<string>()
    for (const row of rows) {
      if (!row || typeof row !== "object") throw new ProductEditError("Invalid variant row")
      if (row.id && (!existingIds.has(row.id) || requestedIds.has(row.id))) throw new ProductEditError("Invalid or duplicate variant ID", 403)
      if (row.id) requestedIds.add(row.id)
      if (!row.id && row.price === undefined) throw new ProductEditError("New variants require an MRP")
      if (row.price !== undefined) amount(row.price, "MRP")
      if (row.discounted_price !== undefined && row.discounted_price !== null) amount(row.discounted_price, "Sale price")
      if (row.inventory_quantity !== undefined && (!Number.isSafeInteger(row.inventory_quantity) || row.inventory_quantity < 0)) throw new ProductEditError("Stock must be a nonnegative integer")
      if (row.sku !== undefined && row.sku !== null && typeof row.sku !== "string") throw new ProductEditError("SKU must be text")
      if (typeof row.sku === "string" && row.sku.trim()) {
        const sku = row.sku.trim().toUpperCase()
        if (skus.has(sku)) throw new ProductEditError("Duplicate SKU")
        skus.add(sku)
      }
      if (matrix) {
        row.options = row.options || row.option_values || {}
        const combo = JSON.stringify(options.map(opt => {
          const value = row.options[opt.title]
          if (typeof value !== "string" || !opt.values.includes(value.trim())) throw new ProductEditError(`Missing or invalid ${opt.title}`)
          return value.trim()
        }))
        if (combinations.has(combo)) throw new ProductEditError("Duplicate variant combination")
        combinations.add(combo)
      }
    }

    const oldOptions = await trx("product_option").where({ product_id: productId }).whereNull("deleted_at")
    const keepOptions = new Set<string>()
    for (const opt of options) {
      const found = oldOptions.find((stored: any) => stored.title === opt.title)
      const result = found
        ? await products.updateProductOptions(found.id, { title: opt.title, values: opt.values }, context)
        : await products.createProductOptions({ product_id: productId, title: opt.title, values: opt.values }, context)
      keepOptions.add(result.id)
    }
    const visual = body.primary_visual_option || stored.metadata?.primary_visual_option || detectVisualOption(options.map(o => o.title))
    const colors = owns(body, "color_images")
      ? sanitizeColorImages(body.color_images, new Set(options.find(o => o.title === visual)?.values || []))
      : stored.metadata?.color_images
    const keepVariants = new Set<string>()
    for (const row of rows) {
      const update: any = {}
      for (const key of ["title", "sku", "manage_inventory", "allow_backorder"]) if (owns(row, key)) update[key] = row[key]
      if (typeof update.sku === "string") update.sku = update.sku.trim() || null
      if (matrix) update.options = Object.fromEntries(options.map(o => [o.title, row.options[o.title].trim()]))
      if (visual && colors && update.options?.[visual]) update.thumbnail = resolveColorImagesForValue(update.options[visual], colors)?.[0] || null
      let variant: any
      if (row.id) {
        variant = await products.updateProductVariants(row.id, update, context)
      } else {
        if (!matrix) throw new ProductEditError("Variant ID is required")
        variant = await products.createProductVariants({ ...update, product_id: productId, title: update.title || Object.values(update.options).join(" / ") }, context)
      }
      row.id = variant.id
      keepVariants.add(variant.id)
      let priceSet = await trx("product_variant_price_set").where({ variant_id: variant.id }).whereNull("deleted_at").first()
      if (!priceSet && (row.price !== undefined || row.discounted_price != null)) {
        const id = generateEntityId(undefined, "pset")
        await trx("price_set").insert({ id })
        await trx("product_variant_price_set").insert({ id: generateEntityId(undefined, "link"), variant_id: variant.id, price_set_id: id })
        priceSet = { price_set_id: id }
      }
      if (priceSet) {
        const base = await trx("price").where({ price_set_id: priceSet.price_set_id, currency_code: "inr" }).whereNull("price_list_id").whereNull("deleted_at").first()
        const mrp = row.price ?? (base ? Number(base.amount) : null)
        const previousSale = row.discounted_price === undefined
          ? await trx("price").where({ price_set_id: priceSet.price_set_id, currency_code: "inr" }).whereNotNull("price_list_id").whereNull("deleted_at").first()
          : null
        const effectiveSale = row.discounted_price === undefined ? (previousSale ? Number(previousSale.amount) : null) : row.discounted_price
        if (effectiveSale != null && (mrp == null || effectiveSale > mrp)) throw new ProductEditError("Sale price cannot exceed MRP")
        const upsert = async (value: number, listId: string | null) => {
          const query = trx("price").where({ price_set_id: priceSet.price_set_id, currency_code: "inr" }).whereNull("deleted_at")
          listId ? query.where({ price_list_id: listId }) : query.whereNull("price_list_id")
          const found = await query.first()
          const data = { amount: value, raw_amount: JSON.stringify({ value: String(value), precision: 20 }), updated_at: new Date() }
          if (found) await trx("price").where({ id: found.id }).update(data)
          else await trx("price").insert({ id: generateEntityId(undefined, "price"), price_set_id: priceSet.price_set_id, currency_code: "inr", price_list_id: listId, ...data })
        }
        if (row.price !== undefined) await upsert(row.price, null)
        // Explicit null means remove; omission means preserve. Never coerce null to zero.
        if (row.discounted_price === null) {
          await trx("price").where({ price_set_id: priceSet.price_set_id, currency_code: "inr" }).whereNotNull("price_list_id").whereNull("deleted_at").update({ deleted_at: new Date(), updated_at: new Date() })
        } else if (row.discounted_price !== undefined) {
          let sale = await trx("price").where({ price_set_id: priceSet.price_set_id, currency_code: "inr" }).whereNotNull("price_list_id").whereNull("deleted_at").first()
          if (!sale) {
            const list = await trx("price_list").where({ status: "active" }).whereNull("deleted_at").orderByRaw("CASE WHEN LOWER(title) LIKE '%india%' THEN 0 ELSE 1 END").orderBy("created_at", "asc").first()
            if (!list) throw new ProductEditError("No active sale price list is configured")
            sale = { price_list_id: list.id }
          }
          await upsert(row.discounted_price, sale.price_list_id)
        }
      }
      if (row.inventory_quantity !== undefined || owns(row, "sku") || owns(row, "manage_inventory")) {
        const links = await trx("product_variant_inventory_item").where({ variant_id: variant.id }).whereNull("deleted_at")
        if ((links.length > 1 || Number(links[0]?.required_quantity || 1) !== 1) && row.inventory_quantity !== undefined) throw new ProductEditError("Update component inventory separately for a multi-item variant")
        let itemId = links[0]?.inventory_item_id
        let createdItem = false
        if (!itemId && variant.manage_inventory) {
          const item = await inventory.createInventoryItems({ sku: variant.sku || undefined }, stockContext())
          itemId = item.id
          createdItem = true
          await trx("product_variant_inventory_item").insert({ id: generateEntityId(undefined, "pvitem"), variant_id: variant.id, inventory_item_id: itemId, required_quantity: 1 })
        }
        if (itemId) {
          const otherLinks = await trx("product_variant_inventory_item").where({ inventory_item_id: itemId }).whereNot({ variant_id: variant.id }).whereNull("deleted_at").first()
          if (otherLinks) throw new ProductEditError("Shared inventory must be updated through inventory management")
          if (owns(row, "sku")) await inventory.updateInventoryItems({ id: itemId, sku: variant.sku || null }, stockContext())
          if ((row.inventory_quantity !== undefined || createdItem) && variant.manage_inventory) {
            const levels = await trx("inventory_level").where({ inventory_item_id: itemId }).whereNull("deleted_at").forUpdate()
            const location = levels[0] || await trx("stock_location").whereNull("deleted_at").orderBy("created_at", "asc").first()
            if (!location) throw new ProductEditError("Configure a stock location before saving inventory")
            const locationId = levels[0]?.location_id || location.id
            const otherStock = levels.slice(1).reduce((sum: number, level: any) => sum + Number(level.stocked_quantity), 0)
            const target = (row.inventory_quantity ?? 0) - otherStock
            if (target < 0 || target < Number(levels[0]?.reserved_quantity || 0)) throw new ProductEditError("Stock cannot be lower than inventory already held at other locations or reserved for orders")
            if (levels.length) await inventory.updateInventoryLevels({ inventory_item_id: itemId, location_id: locationId, stocked_quantity: target }, stockContext())
            else await inventory.createInventoryLevels({ inventory_item_id: itemId, location_id: locationId, stocked_quantity: target }, stockContext())
          }
        }
      }
    }
    if (matrix) {
      const removed = existing.filter((v: any) => !keepVariants.has(v.id)).map((v: any) => v.id)
      if (removed.length) {
        const reserved = await trx("reservation_item as r").join("product_variant_inventory_item as l", "l.inventory_item_id", "r.inventory_item_id").whereIn("l.variant_id", removed).whereNull("r.deleted_at").first()
        if (reserved) throw new ProductEditError("Cannot remove a variant with reserved inventory")
        await products.softDeleteProductVariants(removed, context)
        // Release SKU uniqueness while preserving historical rows/links.
        const removedLinks = await trx("product_variant_inventory_item").whereIn("variant_id", removed).whereNull("deleted_at")
        for (const link of removedLinks) {
          const retained = await trx("product_variant_inventory_item").where({ inventory_item_id: link.inventory_item_id }).whereNotIn("variant_id", removed).whereNull("deleted_at").first()
          if (!retained) await trx("inventory_item").where({ id: link.inventory_item_id }).update({ sku: null, updated_at: new Date() })
        }
      }
      if (removed.length) await trx("product_variant_inventory_item").whereIn("variant_id", removed).whereNull("deleted_at").update({ deleted_at: new Date() })
      const obsolete = oldOptions.filter((o: any) => !keepOptions.has(o.id)).map((o: any) => o.id)
      if (obsolete.length) await products.softDeleteProductOptions(obsolete, context)
    }
    const now = new Date().toISOString()
    const remark = typeof body.vendor_edit_remark === "string" ? body.vendor_edit_remark.trim() : ""
    const metadata = {
      ...stored.metadata, ...cleanVendorMetadata(body.metadata), vendor_id: vendorId,
      approval_status: "pending", submitted_at: now, resubmitted_at: now,
      approved_at: null, approved_by: null, rejected_at: null, rejected_by: null, rejection_reason: null,
      vendor_edit_remark: remark || null,
      vendor_edit_history: [...(Array.isArray(stored.metadata?.vendor_edit_history) ? stored.metadata.vendor_edit_history : []), ...(remark ? [{ remark, submitted_at: now, vendor_id: vendorId }] : [])],
      ...(owns(body, "color_images") ? { color_images: colors } : {}),
      ...(visual ? { primary_visual_option: visual } : {}),
    }
    for (const key of ["return_window_days", "replacement_window_days", "return_replacement_policy_configured"]) delete metadata[key]
    const data: any = { status: "draft", metadata }
    for (const key of ["title", "description", "handle", "category_ids", "collection_id", "images", "thumbnail", "weight"]) if (owns(body, key)) data[key] = body[key]
    if (data.thumbnail != null && (typeof data.thumbnail !== "string" || !/^https?:\/\//i.test(data.thumbnail))) throw new ProductEditError("thumbnail must be an HTTP(S) URL or null")
    await products.updateProducts(productId, data, context)
    return products.retrieveProduct(productId, { relations: ["images", "categories", "collection"] }, context)
  })
  // External notifications/indexing cannot join PostgreSQL's transaction.
  // Release events only after commit; a notification failure is not a failed save.
  for (const [service, events] of [[products, productEvents], [inventory, inventoryEvents]] as const) {
    if (events.pending()) {
      try { await service.emitEvents_(events.getMessages()) }
      catch (error) { console.warn("Product edit committed; module event delivery needs retry", error instanceof Error ? error.message : "event error") }
    }
  }
  return saved
}
