import { NextResponse } from "next/server";
import { buildHomeFeedCached } from "@/lib/home-feed-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { feed, expiresAt } = await buildHomeFeedCached();
    const snapshotEnabled = process.env.HOME_FEED_SNAPSHOT_ENABLED === "true";
    const cacheSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return NextResponse.json(feed, {
      headers: {
        "Cache-Control": snapshotEnabled
          ? `public, max-age=0, s-maxage=${cacheSeconds}, must-revalidate`
          : "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
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
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
