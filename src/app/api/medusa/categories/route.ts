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
    const categories = await fetchCategories({ revalidate: 120 });
    return NextResponse.json(
      { categories },
      {
        headers: {
          "Cache-Control":
            "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
