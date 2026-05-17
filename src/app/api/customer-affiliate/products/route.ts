import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const MEDUSA_URL =
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"

const PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_API_KEY ||
    ""

const SALES_CHANNEL_ID =
    process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
    process.env.MEDUSA_SALES_CHANNEL_ID ||
    ""

const PRODUCT_FIELDS = [
    "id",
    "title",
    "handle",
    "thumbnail",
    "images.url",
    "variants.id",
    "variants.calculated_price",
    "variants.prices.amount",
].join(",")

type MedusaImage = { url?: string }
type MedusaPrice = { amount?: number }
type MedusaVariant = {
    id?: string
    calculated_price?: { calculated_amount?: number; raw_calculated_amount?: { value?: string } }
    prices?: MedusaPrice[]
}
type MedusaProduct = {
    id?: string
    title?: string
    handle?: string
    thumbnail?: string
    images?: MedusaImage[]
    variants?: MedusaVariant[]
}

function pickPrice(product: MedusaProduct): number {
    const v = product.variants?.[0]
    if (!v) return 0
    const calc = v.calculated_price?.calculated_amount
    if (typeof calc === "number") return calc
    const raw = v.calculated_price?.raw_calculated_amount?.value
    if (raw) return parseFloat(raw)
    const fromPrices = v.prices?.[0]?.amount
    if (typeof fromPrices === "number") return fromPrices / 100
    return 0
}

function pickImage(product: MedusaProduct): string {
    if (product.thumbnail) return product.thumbnail
    if (product.images?.[0]?.url) return product.images[0].url!
    return "/oweg_logo.png"
}

// Medusa's /store/products endpoint caps the per-request limit (default 100),
// so we always page through it in chunks of PAGE_SIZE and stop when we hit
// the reported total or the safety cap.
const PAGE_SIZE = 100
const HARD_SAFETY_CAP = 2000

/**
 * GET /api/customer-affiliate/products
 *   ?limit=all      -> return every published product (default)
 *   ?limit=24       -> return the first 24
 *   ?offset=24      -> only honored when limit is numeric
 *   ?q=pigeon       -> server-side full-text search (forwarded to Medusa)
 *
 * Returns a slim list of products usable for sharing with a referral code.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const rawLimit = (searchParams.get("limit") || "all").toLowerCase()
    const wantAll = rawLimit === "all" || rawLimit === "0"
    const requestedLimit = wantAll
        ? HARD_SAFETY_CAP
        : Math.min(Math.max(parseInt(rawLimit, 10) || 24, 1), HARD_SAFETY_CAP)
    const startOffset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0)
    const searchQuery = (searchParams.get("q") || "").trim().slice(0, 100)

    const baseHeaders = {
        "content-type": "application/json",
        ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}),
        ...(SALES_CHANNEL_ID ? { "x-sales-channel-id": SALES_CHANNEL_ID } : {}),
    }

    try {
        const collected: MedusaProduct[] = []
        let totalCount = 0
        let cursorOffset = startOffset

        while (collected.length < requestedLimit) {
            const pageLimit = Math.min(PAGE_SIZE, requestedLimit - collected.length)
            const params = new URLSearchParams()
            params.set("limit", String(pageLimit))
            params.set("offset", String(cursorOffset))
            params.set("fields", PRODUCT_FIELDS)
            if (searchQuery) params.set("q", searchQuery)

            const url = `${MEDUSA_URL.replace(/\/$/, "")}/store/products?${params.toString()}`
            const res = await fetch(url, { cache: "no-store", headers: baseHeaders })

            if (!res.ok) {
                const errText = await res.text().catch(() => "")
                return NextResponse.json(
                    { error: "Failed to fetch products", status: res.status, details: errText },
                    { status: 502 }
                )
            }

            const data = (await res.json()) as { products?: MedusaProduct[]; count?: number }
            const page = data.products || []
            if (typeof data.count === "number") totalCount = data.count

            collected.push(...page)
            cursorOffset += page.length

            if (page.length === 0) break
            if (totalCount && collected.length >= totalCount) break
        }

        const products = collected.map((p) => ({
            id: p.id,
            handle: p.handle,
            name: p.title,
            image: pickImage(p),
            price: pickPrice(p),
        }))

        return NextResponse.json({
            products,
            count: totalCount || products.length,
        })
    } catch (error) {
        console.error("[customer-affiliate/products] error:", error)
        return NextResponse.json(
            {
                error: "Failed to fetch products",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        )
    }
}
