import { NextRequest, NextResponse } from "next/server";
import { isFeaturedProductsCursor } from "../../../../my-medusa-store/src/shared/featured-products";
import { loadFeaturedProductsPage } from "@/lib/featured-products-server";

export async function GET(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!cursor || !isFeaturedProductsCursor(cursor)) {
    return NextResponse.json({ message: "Invalid featured products cursor." }, { status: 400 });
  }

  try {
    const row = await loadFeaturedProductsPage(cursor);
    if (!row) return NextResponse.json({ message: "The featured selection has changed." }, { status: 409 });
    return NextResponse.json(row, { headers: { "Cache-Control": "public, max-age=0, s-maxage=15" } });
  } catch {
    return NextResponse.json({ message: "Unable to load more featured products." }, { status: 503 });
  }
}
