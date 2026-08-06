import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../_lib/guards"
import { filterVendorVisibleOrders } from "../../../lib/vendor-order-visibility"
import { getVendorEarningsByOrderIds } from "../../../lib/vendor-earnings"

function getPool() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  const isLocal = /localhost|127\.0\.0\.1/.test(url)
  return new Pool({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  })
}

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
    res.setHeader('Access-Control-Allow-Origin', process.env.VENDOR_CORS || 'http://localhost:4000')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
    setCorsHeaders(res)
    return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    setCorsHeaders(res)
    const auth = await requireApprovedVendor(req, res)
    if (!auth) return

    try {
        console.log(`[Customers API] Starting for vendor: ${auth.vendor_id}`)
        const query = req.scope.resolve("query")

        // Use query module to efficiently get vendor's product IDs with metadata filter
        const { data: vendorProducts } = await query.graph({
            entity: "product",
            fields: ["id"],
            filters: {
                metadata: {
                    vendor_id: auth.vendor_id
                }
            }
        })

        if (!vendorProducts || vendorProducts.length === 0) {
            console.log(`[Customers API] No products found for vendor ${auth.vendor_id}`)
            return res.json({ customers: [] })
        }

        const vendorProductIds = vendorProducts.map((p: any) => p.id)
        console.log(`[Customers API] Found ${vendorProductIds.length} vendor products`)

        // Get orders with items - use query module for efficiency
        const { data: ordersData } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "customer_id",
                "email",
                "status",
                "is_draft_order",
                "metadata",
                "summary",
                "created_at",
                "items.product_id",
                "items.variant.product_id",
                "customer.first_name",
                "customer.last_name",
                "customer.phone",
                "shipping_address.first_name",
                "shipping_address.last_name",
                "shipping_address.phone",
                "fulfillments.id",
                "fulfillments.delivered_at",
            ],
            filters: {}
        })

        console.log(`[Customers API] Total orders in system: ${ordersData?.length || 0}`)

        // Filter orders that contain vendor's products
        const vendorOrders = filterVendorVisibleOrders(
            (ordersData || []).filter((order: any) => {
                const items = order.items || []
                return items.some((item: any) => {
                    const productId = item.product_id || item.variant?.product_id
                    const isVendorProduct = productId && vendorProductIds.includes(productId)
                    return isVendorProduct
                })
            })
        )

        console.log(`[Customers API] Found ${vendorOrders.length} orders with vendor products`)

        const orderIds = vendorOrders.map((order: any) => order.id)
        const pool = getPool()
        const earningsByOrder = pool
          ? await getVendorEarningsByOrderIds(auth.vendor_id, orderIds, pool).finally(() =>
              pool.end().catch(() => {})
            )
          : {}

        // Aggregate customer data from vendor orders (payout amounts, not raw order totals)
        const customerMap = new Map<string, {
            id: string
            email: string | null
            first_name?: string | null
            last_name?: string | null
            phone?: string | null
            orders_count: number
            open_orders_count: number
            total_spent: number
            order_value: number
            first_order_date: string
            last_order_date: string
            details_hidden: boolean
        }>()

        for (const order of vendorOrders) {
            const customerId = order.customer_id || order.email || 'guest'
            const customerEmail = order.email || 'N/A'
            const meta = order.metadata || {}
            const vendorWf =
              meta.vendor_order_workflows?.[auth.vendor_id] ||
              meta.vendor_order_workflows?.[String(auth.vendor_id)] ||
              {}
            const isDelivered =
              (order.fulfillments || []).some((f: any) => f?.delivered_at) ||
              String(meta.shiprocket_status || "").toLowerCase().includes("deliver") ||
              String(vendorWf.stage || "").toLowerCase() === "delivered" ||
              String(vendorWf.shiprocket_status || "").toLowerCase().includes("deliver")

            const orderTotal = Number(order.summary?.current_order_total) || 0
            const payoutAmount = Number(earningsByOrder[order.id]?.net_amount) || 0

            if (customerMap.has(customerId)) {
                const existing = customerMap.get(customerId)!
                existing.orders_count++
                if (!isDelivered) {
                  existing.open_orders_count++
                  existing.first_name =
                    order.customer?.first_name ||
                    order.shipping_address?.first_name ||
                    existing.first_name
                  existing.last_name =
                    order.customer?.last_name ||
                    order.shipping_address?.last_name ||
                    existing.last_name
                  existing.phone =
                    order.customer?.phone ||
                    order.shipping_address?.phone ||
                    existing.phone
                  existing.email = customerEmail
                }
                existing.total_spent += payoutAmount
                existing.order_value += orderTotal

                // Update date ranges - convert to string to ensure type safety
                const orderDate = typeof order.created_at === 'string' ? order.created_at : order.created_at.toISOString()
                if (new Date(orderDate) < new Date(existing.first_order_date)) {
                    existing.first_order_date = orderDate
                }
                if (new Date(orderDate) > new Date(existing.last_order_date)) {
                    existing.last_order_date = orderDate
                }
            } else {
                const orderDate = typeof order.created_at === 'string' ? order.created_at : order.created_at.toISOString()
                customerMap.set(customerId, {
                    id: customerId,
                    email: customerEmail,
                    first_name: order.customer?.first_name || order.shipping_address?.first_name,
                    last_name: order.customer?.last_name || order.shipping_address?.last_name,
                    phone: order.customer?.phone || order.shipping_address?.phone,
                    orders_count: 1,
                    open_orders_count: isDelivered ? 0 : 1,
                    total_spent: payoutAmount,
                    order_value: orderTotal,
                    first_order_date: orderDate,
                    last_order_date: orderDate,
                    details_hidden: false,
                })
            }
        }

        const customers = Array.from(customerMap.values())
            .map((customer) => {
              const detailsHidden = customer.open_orders_count === 0
              if (!detailsHidden) {
                return { ...customer, details_hidden: false }
              }
              return {
                ...customer,
                details_hidden: true,
                email: null,
                first_name: null,
                last_name: null,
                phone: null,
              }
            })
            .sort((a, b) => b.total_spent - a.total_spent) // Sort by total spent descending

        console.log(`[Customers API] Returning ${customers.length} unique customers`)
        return res.json({ customers })
    } catch (error: any) {
        console.error("Vendor customers list error:", error)
        return res.status(500).json({ message: error?.message || "Failed to list customers" })
    }
}
