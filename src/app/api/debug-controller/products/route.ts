import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import { searchAdminProducts } from "@/lib/debug-controller/products";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const limit = Number(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const products = await searchAdminProducts(q, Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
