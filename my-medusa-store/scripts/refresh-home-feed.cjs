const path = require("node:path");
const fs = require("node:fs");

async function main() {
  const backend = path.resolve(__dirname, "..");
  require("dotenv").config({ path: path.join(backend, ".env") });
  process.env.MEDUSA_BACKEND_URL = process.env.HOME_FEED_MEDUSA_URL || "http://127.0.0.1:9000";
  const migrate = process.argv.includes("--migrate");
  const check = process.argv.includes("--check");
  if (!process.env.DATABASE_URL || (!migrate && !check &&
      !(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY))) {
    throw new Error("Configure DATABASE_URL and the storefront publishable key before refreshing");
  }
  require("ts-node").register({
    skipProject: true,
    transpileOnly: true,
    compilerOptions: { module: "CommonJS", moduleResolution: "Node", target: "ES2022" },
  });
  const { buildHomeFeed } = require("../../src/lib/home-feed.ts");
  const { refreshHomeFeedSnapshot, readHomeFeedSnapshot } = require("../../src/lib/home-feed-snapshot.ts");
  const { getSharedDbPool } = require("../src/lib/db-pool.ts");
  const pool = getSharedDbPool();
  try {
    if (migrate) {
      await pool.query(fs.readFileSync(path.join(backend, "migrations/home-feed-snapshot.sql"), "utf8"));
      console.log("Homepage snapshot table ready");
      return;
    }
    if (check) {
      const { feed, expiresAt } = await readHomeFeedSnapshot(pool);
      console.log(JSON.stringify({
        sections: feed.sections.length,
        products: feed.meta.totalProducts,
        expiresAt: new Date(expiresAt).toISOString(),
      }));
      return;
    }
    console.log("Homepage snapshot:", await refreshHomeFeedSnapshot(pool, buildHomeFeed));
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("Homepage snapshot refresh failed:", error.message);
  process.exitCode = 1;
});
