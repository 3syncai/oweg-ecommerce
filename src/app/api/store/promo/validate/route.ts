import { NextRequest, NextResponse } from "next/server";
import { validateMedusaPromoCode } from "@/lib/medusa-promo";

export const dynamic = "force-dynamic";

/**
 * POST /api/store/promo/validate
 * Body: { code: string, itemsSubtotal: number }
 * Validates an active Medusa promotion for OWEG checkout (not OWEG10/coins).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    const itemsSubtotal =
      typeof body.itemsSubtotal === "number"
        ? body.itemsSubtotal
        : Number(body.itemsSubtotal) || 0;

    const result = await validateMedusaPromoCode(code, itemsSubtotal);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("promo validate failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to validate promo code." },
      { status: 500 }
    );
  }
}
