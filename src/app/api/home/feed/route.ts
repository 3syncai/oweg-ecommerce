import { NextResponse } from "next/server";
import { buildHomeFeed } from "@/lib/home-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const feed = await buildHomeFeed();
    return NextResponse.json(feed, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to build home feed";
    return NextResponse.json({ error: message, sections: [], spotlight: null, popular: null }, { status: 500 });
  }
}
