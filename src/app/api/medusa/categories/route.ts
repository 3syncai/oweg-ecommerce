import { NextRequest, NextResponse } from "next/server";
import { fetchCategories, findCategoryByTitleOrHandle } from "@/lib/medusa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const handle = searchParams.get("handle");

    // If handle is provided, find specific category
    if (handle) {
      const category = await findCategoryByTitleOrHandle(handle);
      return NextResponse.json({ category: category || null });
    }

    // Otherwise return all categories
    const categories = await fetchCategories();
    return NextResponse.json({ categories });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
