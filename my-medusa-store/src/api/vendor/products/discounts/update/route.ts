import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

interface UpdateDiscountPriceRequest {
    variant_id: string
    price_list_id: string
    currency_code: string
    amount: number
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { variant_id, price_list_id, currency_code, amount } = req.body as UpdateDiscountPriceRequest

        // Validation
        if (!variant_id || !price_list_id || !currency_code || amount == null) {
            return res.status(400).json({
                error: "Missing required fields",
                message: "variant_id, price_list_id, currency_code, and amount are required"
            })
        }

        if (amount <= 0) {
            return res.status(400).json({
                error: "Invalid amount",
                message: "Amount must be greater than 0"
            })
        }

        const pricingModule = req.scope.resolve(Modules.PRICING)

        // Find the existing price entry
        const existingPrices = await pricingModule.listPrices({
            price_list_id: [price_list_id],
            currency_code: [currency_code]
        })

        // Get the price_set_id for this variant
        const knex = req.scope.resolve("__pg_connection__")
        const priceSetResult = await knex.raw(`
      SELECT price_set_id 
      FROM product_variant_price_set 
      WHERE variant_id = ?
    `, [variant_id])

        if (!priceSetResult.rows || priceSetResult.rows.length === 0) {
            return res.status(404).json({
                error: "Price set not found",
                message: "Could not find price set for this variant"
            })
        }

        const price_set_id = priceSetResult.rows[0].price_set_id

        // Find the specific price to update
        const priceToUpdate = existingPrices.find(p =>
            p.price_set_id === price_set_id
        )

        if (!priceToUpdate) {
            return res.status(404).json({
                error: "Price not found",
                message: "Could not find price list price for this variant and currency"
            })
        }

        // Update the price
        await pricingModule.updatePrices([{
            id: priceToUpdate.id,
            amount: amount
        }])

        return res.json({
            success: true,
            message: "Price updated successfully",
            updated: {
                id: priceToUpdate.id,
                amount: amount,
                variant_id,
                price_list_id,
                currency_code
            }
        })
    } catch (error: any) {
        console.error("Price update error:", error)
        return res.status(500).json({
            error: error.message,
            message: "Failed to update price",
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })
    }
}
