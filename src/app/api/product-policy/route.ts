import { NextRequest, NextResponse } from "next/server"
import { configuredReturnPolicyForProduct } from "../../../../my-medusa-store/src/lib/vendor-return-policy"
import { getStorefrontPool } from "@/lib/storefront-db"
import { clientIpFromRequest, rateLimitOrNull } from "@/lib/simple-rate-limit"

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("variant")
  if (!id || !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) return NextResponse.json({ policy: null }, { status: 400 })
  const limited = rateLimitOrNull(req, { key: "product-policy:" + clientIpFromRequest(req), limit: 120 })
  if (limited) return limited
  try {
    const pool = getStorefrontPool()
    const categories = await pool.query<{category_id:string}>(`
      SELECT pc.product_category_id AS category_id FROM product_variant v
      JOIN product p ON p.id=v.product_id AND p.deleted_at IS NULL AND p.status='published'
      JOIN product_category_product pc ON pc.product_id=p.id
      WHERE v.id=$1 AND v.deleted_at IS NULL AND COALESCE(p.metadata->>'approval_status','approved')='approved'
      ORDER BY pc.product_category_id`, [id])
    const policy = await configuredReturnPolicyForProduct(pool, categories.rows.map(row => row.category_id))
    return NextResponse.json({ policy }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } })
  } catch {
    return NextResponse.json({policy:null}, {status:503, headers: {"Cache-Control":"no-store"}})
  }
}
