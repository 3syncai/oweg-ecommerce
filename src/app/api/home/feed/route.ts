import { NextResponse } from "next/server";
import { buildHomeFeedCached } from "@/lib/home-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { feed } = await buildHomeFeedCached();
    return NextResponse.json(feed, {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("home feed failed", err);
    return NextResponse.json(
      {
        error: "Unable to load home feed",
        sections: [],
        spotlight: null,
        popular: null,
      },
      { status: 500 },
    );
  }
}
