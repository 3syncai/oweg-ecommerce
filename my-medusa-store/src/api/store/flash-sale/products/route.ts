import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import FlashSaleModuleService from "../../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"
import { assessFlashSales } from "../../../../lib/flash-sale-eligibility"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const service: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    const catalog = req.scope.resolve(Modules.PRODUCT)
    const now = Date.now()
    const active = (await service.getAllFlashSaleItems()).filter(item => !item.deleted_at && +new Date(item.expires_at) > now)
    const rows = (await assessFlashSales(active)).filter(item => !item.reason)
      .sort((a, b) => Number(a.flash_sale_price) - Number(b.flash_sale_price) || +new Date(a.expires_at) - +new Date(b.expires_at))
    const ids = [...new Set(rows.map(item => item.product_id))]
    const catalogRows: Awaited<ReturnType<typeof catalog.listProducts>> = []
    for (let offset = 0; offset < ids.length; offset += 60) {
      catalogRows.push(...await catalog.listProducts({ id: ids.slice(offset, offset + 60), status: ["published"] }, { take: 60 }))
    }
    const byId = new Map(catalogRows.map(p => [p.id, p]))
    const seen = new Set<string>()
    const products = rows.flatMap(item => {
      const product = byId.get(item.product_id)
      if (!product || seen.has(item.variant_id)) return []
      seen.add(item.variant_id)
      return [{ ...product, variant_id: item.variant_id, seller: item.seller,
        flash_sale_price: Number(item.flash_sale_price), original_price: Math.min(item.regular, Number(item.original_price)),
        flash_sale: { title: item.title, expires_at: item.expires_at, time_remaining_ms: +new Date(item.expires_at) - now } }]
    })
    const earliest = products.reduce<typeof products[number] | undefined>((first, item) =>
      !first || item.flash_sale.time_remaining_ms < first.flash_sale.time_remaining_ms ? item : first, undefined)
    return res.json({ active: Boolean(earliest), products, flash_sale: earliest ?
      { ...earliest.flash_sale, item_count: products.length } : null })
  } catch (error) {
    console.error("Error fetching flash sale offers", error)
    return res.status(503).json({ active: false, flash_sale: null, products: [] })
  }
}
