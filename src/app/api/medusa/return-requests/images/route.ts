import { NextRequest, NextResponse } from "next/server"
import { medusaStoreFetch } from "@/lib/medusa-auth"
import { returnRequestError } from "@/lib/return-request-error"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file")
    const orderId = form.get("order_id")
    const itemId = form.get("order_item_id")
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        typeof orderId !== "string" || typeof itemId !== "string")
      return NextResponse.json({ error: "Choose a JPG, PNG or WebP photo up to 3 MB." }, { status: 400 })
    const response = await medusaStoreFetch("/store/return-requests/images", {
      method: "POST", forwardedCookie: req.headers.get("cookie") || undefined,
      body: JSON.stringify({ order_id: orderId, order_item_id: itemId,
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) return NextResponse.json({ error: response.status >= 500
      ? "Photos could not be uploaded right now. Please try again." : returnRequestError(response.status, data) }, { status: response.status })
    return NextResponse.json(data)
  } catch { return NextResponse.json({ error: "Photos could not be uploaded. Please try again." }, { status: 503 }) }
}
