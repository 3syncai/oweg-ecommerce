import { applyGroupValidation, buildOptionsFromGroup, normalizeImageKey, rowOptionValues, type ParsedRow } from "./bulk-upload"
import { toProductDescriptionHtml } from "./plain-description"

export const buildBulkPayload = (groupRows: ParsedRow[], imageMap: Record<string, { status: string; url?: string }>) => {
  if (!groupRows.length || applyGroupValidation(groupRows).some(row => row.errors.length)) throw new Error("Fix product validation errors before creating a payload")
  const row = groupRows[0]

  const collectionId =
    row.selectedCollectionId || null
  const collectionRequest = (row.collectionRequest || "").trim()
  const categoryId =
    row.selectedCategoryId
  const categoryRequest = (row.categoryRequest || "").trim()
  const categoryIds = [...new Set([...(categoryId ? [categoryId] : []), ...row.additionalCategoryIds])]

  const parseNumber = (value: string): number | null => {
    if (!value) return null
    const num = parseFloat(value)
    return Number.isFinite(num) ? num : null
  }

  const lookupUrl = (name: string): string | null => {
    if (!name) return null
    const s = imageMap[normalizeImageKey(name)]
    if (!s || s.status !== "uploaded" || !s.url) throw new Error(`Missing image: ${name}`)
    return s.url
  }

  const allImageUrls: string[] = []
  groupRows.forEach((groupRow) => {
    const thumbnailUrl = lookupUrl(groupRow.thumbnailRef)
    if (thumbnailUrl && !allImageUrls.includes(thumbnailUrl)) {
      allImageUrls.push(thumbnailUrl)
    }
    [...groupRow.imageRefs, ...groupRow.visualImageRefs].forEach((name) => {
      const url = lookupUrl(name)
      if (url && !allImageUrls.includes(url)) allImageUrls.push(url)
    })
  })

  const thumbnailUrl = lookupUrl(row.thumbnailRef) || allImageUrls[0] || null
  const optionMap = rowOptionValues(row)
  const hasOptions = Object.keys(optionMap).length > 0 || groupRows.some((r) => Object.keys(rowOptionValues(r)).length > 0)

  const variantsPayload = groupRows.map((groupRow) => {
    const inventoryQuantity = Math.max(
      0,
      Math.floor(Number.parseInt(groupRow.inventoryCount, 10)) || 0
    )

    const numPrice = parseFloat(groupRow.price)
    const numDiscount = parseFloat(groupRow.discountedPrice)
    const prices: Array<{ amount: number; currency_code: string; price_list_id?: string }> = []
    if (Number.isFinite(numPrice)) {
      prices.push({ amount: numPrice, currency_code: "inr" })
    }
    if (Number.isFinite(numDiscount) && numDiscount >= 0 && numDiscount < numPrice) {
      prices.push({
        amount: numDiscount,
        currency_code: "inr",
        price_list_id: "pl_1765232034558",
      })
    }

    const variantOptions = rowOptionValues(groupRow)
    const variantTitle =
      groupRow.variantTitle ||
      (Object.keys(variantOptions).length > 0
        ? Object.values(variantOptions).join(" / ")
        : "Default variant")

    return {
      title: variantTitle,
      sku: groupRow.sku || undefined,
      manage_inventory: groupRow.managedInventory,
      allow_backorder: groupRow.allowBackorder,
      inventory_quantity: inventoryQuantity,
      prices,
      ...(Object.keys(variantOptions).length > 0 ? { options: variantOptions } : {}),
    }
  })

  const productOptions = hasOptions ? buildOptionsFromGroup(groupRows) : []

  const optionImages: Record<string, Record<string, string[]>> = Object.create(null)
  for (const variant of groupRows) for (const [name, image] of Object.entries(variant.optionImages || {})) {
    optionImages[name] ||= Object.create(null)
    optionImages[name][image.value] = [...new Set([...(optionImages[name][image.value] || []), ...image.refs.map(lookupUrl).filter((url): url is string => Boolean(url))])]
  }

  const colorImages: Record<string, string[]> = Object.create(null)
  let primaryVisualOption = ""
  groupRows.forEach((groupRow) => {
    const visualName = groupRow.visualOptionName.trim()
    const visualValue = groupRow.visualOptionValue.trim()
    if (!visualName || !visualValue) return
    if (!primaryVisualOption) primaryVisualOption = visualName
    const refs = groupRow.optionImages?.[visualName]?.refs || (groupRow.visualImageRefs.length ? groupRow.visualImageRefs : groupRow.imageRefs)
    const urls = refs
      .map((name) => lookupUrl(name))
      .filter((url): url is string => Boolean(url))
    if (!urls.length) return
    colorImages[visualValue] = Array.from(new Set([...(colorImages[visualValue] || []), ...urls]))
  })

  return {
    title: row.title,
    subtitle: row.subtitle || null,
    description: row.description ? toProductDescriptionHtml(row.description) : null,
    handle: row.handle || null,
    shipping_profile_id: row.shippingProfile || null,
    is_giftcard: false,
    discountable: row.discountable,
    category_ids: categoryIds,
    collection_id: collectionId,
    type: row.type ? row.type.trim() : undefined,
    tags: row.tags.map((value) => ({ value })),
    images: allImageUrls.map((url) => ({ url })),
    thumbnail: thumbnailUrl,
    options: productOptions,
    variants: variantsPayload,
    height: parseNumber(row.height),
    width: parseNumber(row.width),
    length: parseNumber(row.length),
    weight: parseNumber(row.weight),
    metadata: {
      categories: categoryIds,
      tags: row.tags,
      brand: row.brand || null,
      mid_code: row.midCode || null,
      hs_code: row.hsCode || null,
      country_of_origin: row.countryOfOrigin || null,
      tax_code: row.taxCode,
      gst_rate: row.gstRate,
      tax_country: "IN",
      ...(Object.keys(optionImages).length ? { option_images: optionImages } : {}),
      videos: row.videoUrls.length ? row.videoUrls.map(url => ({ url })) : null,
      ...(Object.keys(colorImages).length > 0
        ? {
            color_images: colorImages,
            primary_visual_option: primaryVisualOption || null,
          }
        : {}),
      ...(categoryRequest
        ? {
            category_request: categoryRequest,
            category_request_excel_value: row.category || null,
            category_request_status: "pending",
            category_request_submitted_at: new Date().toISOString(),
          }
        : {}),
      ...(collectionRequest
        ? {
            collection_request: collectionRequest,
            collection_request_excel_value: row.collection || null,
            collection_request_status: "pending",
            collection_request_submitted_at: new Date().toISOString(),
          }
        : {}),
    },
  }
}
