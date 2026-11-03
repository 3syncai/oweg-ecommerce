import type { Pool } from "pg";
import type { HomeFeedResult, HomeFeedSection } from "./home-feed";

const REFRESH_LOCK = 74638295;
const MAX_AGE_MS = 30 * 60_000;

function isSection(section: Partial<HomeFeedSection> | null | undefined) {
  return Boolean(section && typeof section.key === "string" &&
    typeof section.title === "string" && typeof section.sourceTag === "string" &&
    Array.isArray(section.products) && section.products.length &&
    section.products.every(product => product && product.id &&
      typeof product.name === "string" && Number.isFinite(product.price) &&
      Number(product.inventory_quantity) > 0));
}

function isSnapshot(value: unknown): value is HomeFeedResult {
  const feed = value as Partial<HomeFeedResult> | null;
  return Boolean(feed && Array.isArray(feed.sections) && feed.sections.length &&
    feed.sections.every(isSection) && isSection(feed.popular) &&
    (feed.spotlight === null || isSection(feed.spotlight)) &&
    Number.isFinite(feed.meta?.totalProducts));
}

export async function readHomeFeedSnapshot(pool: Pool): Promise<{ feed: HomeFeedResult; expiresAt: number }> {
  const query = {
    text: "SELECT payload, published_at FROM oweg_home_feed_snapshot WHERE key = 'default'",
    query_timeout: 3000,
  };
  const { rows } = await pool.query(query);
  const payload: unknown = rows[0]?.payload;
  const expiresAt = new Date(rows[0]?.published_at).getTime() + MAX_AGE_MS;
  if (!(expiresAt > Date.now()) || !isSnapshot(payload)) {
    throw new Error("Homepage snapshot is missing, invalid or expired");
  }
  return { feed: payload, expiresAt };
}

export async function refreshHomeFeedSnapshot(
  pool: Pool,
  build: () => Promise<HomeFeedResult>,
): Promise<"published" | "skipped"> {
  const client = await pool.connect();
  let locked = false;
  let discardConnection = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [REFRESH_LOCK]);
    locked = result.rows[0]?.locked === true;
    if (!locked) return "skipped";
    const fresh = await client.query(
      `SELECT 1 FROM oweg_home_feed_snapshot
       WHERE key = 'default' AND published_at > now() - interval '2 minutes'`
    );
    if (fresh.rows.length) return "skipped";

    const feed = await build();
    if (!isSnapshot(feed)) throw new Error("Cannot publish an empty or invalid homepage snapshot");
    await client.query(
      `INSERT INTO oweg_home_feed_snapshot (key, payload, published_at)
       VALUES ('default', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, published_at = EXCLUDED.published_at`,
      [JSON.stringify(feed)],
    );
    return "published";
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [REFRESH_LOCK]);
      } catch {
        discardConnection = true;
      }
    }
    client.release(discardConnection);
  }
}
