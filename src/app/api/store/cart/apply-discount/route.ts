import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const MEDUSA_BACKEND_URL =
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"

const PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    ""

/**
 * POST /api/store/cart/apply-discount
 * Apply discount code to cart
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { cart_id, discount_code } = body

        console.log("Apply discount:", { cart_id, discount_code })

        if (!cart_id || !discount_code) {
            return NextResponse.json(
                { error: "cart_id and discount_code required" },
                { status: 400 }
            )
        }

        // Apply discount to Medusa cart
        // Medusa v2 uses different endpoint structure
        const response = await fetch(
            `${MEDUSA_BACKEND_URL}/store/carts/${cart_id}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {})
                },
                body: JSON.stringify({
                    promo_codes: [discount_code]
                }),
                cache: "no-store"
            }
        )

        if (!response.ok) {
            const text = await response.text()
            console.error("Failed to apply discount:", text)
            return NextResponse.json(
                { error: "Failed to apply discount", details: text },
                { status: response.status }
            )
        }

        const data = await response.json()

        console.log(`✅ Applied discount ${discount_code} to cart ${cart_id}`)
        console.log("Cart after discount:", JSON.stringify(data.cart?.total, null, 2))
        console.log("Cart promotions:", JSON.stringify(data.cart?.promotions, null, 2))

        return NextResponse.json({
            success: true,
            cart: data.cart
        })
    } catch (error) {
        console.error("❌ Apply discount error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/store/cart/apply-discount
 * Remove discount code from cart
 */
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const cart_id = searchParams.get("cart_id")
        const discount_code = searchParams.get("discount_code")

        console.log("Remove discount:", { cart_id, discount_code })

        if (!cart_id || !discount_code) {
            return NextResponse.json(
                { error: "cart_id and discount_code required" },
                { status: 400 }
            )
        }

        // Remove discount from Medusa cart
        // Medusa v2: update cart with empty promo_codes array
        const response = await fetch(
            `${MEDUSA_BACKEND_URL}/store/carts/${cart_id}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {})
                },
                body: JSON.stringify({
                    promo_codes: [] // Clear promo codes
                }),
                cache: "no-store"
            }
        )

        if (!response.ok) {
            const text = await response.text()
            console.error("Failed to remove discount:", text)
            return NextResponse.json(
                { error: "Failed to remove discount", details: text },
                { status: response.status }
            )
        }

        const data = await response.json()

        console.log(`✅ Removed discount ${discount_code} from cart ${cart_id}`)

        return NextResponse.json({
            success: true,
            cart: data.cart
        })
    } catch (error) {
        console.error("❌ Remove discount error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
