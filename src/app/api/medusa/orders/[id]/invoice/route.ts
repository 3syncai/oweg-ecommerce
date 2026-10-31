import { NextRequest, NextResponse } from "next/server"
import { medusaStoreFetch, readTextSafely } from "@/lib/medusa-auth"

/**
 * Proxies authenticated customer invoice PDF from Medusa.
 * GET /api/medusa/orders/:id/invoice
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  const awaitedParams = await ctx.params
  const orderId = awaitedParams?.id
  if (!orderId) {
    return NextResponse.json({ error: "Order id required" }, { status: 400 })
  }

  const forwardedCookie = req.headers.get("cookie") || undefined
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  try {
    const res = await medusaStoreFetch(
      `/store/orders/${encodeURIComponent(orderId)}/invoice`,
      {
        method: "GET",
        forwardedCookie,
        skipContentType: true,
        headers: {
          Cookie: forwardedCookie,
          Accept: "application/pdf",
        },
      }
    )

    if (!res.ok) {
      const text = (await readTextSafely(res)) || "Unable to download invoice"
      let message = text
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string }
        message = parsed.message || parsed.error || text
      } catch {
        // plain text error
      }
      return NextResponse.json({ error: message }, { status: res.status })
    }

    const buffer = await res.arrayBuffer()
    const disposition =
      res.headers.get("Content-Disposition") ||
      `attachment; filename="Invoice-OWEG-${orderId}.pdf"`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error: any) {
    console.error("[customer-invoice] proxy failed:", error)
    return NextResponse.json(
      { error: error?.message || "Unexpected error downloading invoice" },
      { status: 500 }
    )
  }
}
