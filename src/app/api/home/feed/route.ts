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
    console.error("home feed failed", err);
    return NextResponse.json(
      { error: "Unable to load home feed", sections: [], spotlight: null, popular: null },
      { status: 500 }
    );
  }
}
