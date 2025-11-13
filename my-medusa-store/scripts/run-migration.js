const axios = require("axios");

const ETL_BASE = process.env.ETL_BASE_URL?.replace(/\/$/, "") || "http://localhost:7070";
// Accept command line argument: node run-migration.js 2
const cliArg = process.argv[2] ? Number(process.argv[2]) : null;
const MAX_PRODUCTS = cliArg || Number(process.env.MAX_PRODUCTS || 15);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 1500);
const TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 10 * 60 * 1000); // 10 minutes

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(`[run-migration] Using ETL API at ${ETL_BASE}`);
  console.log(`[run-migration] Target maxProducts=${MAX_PRODUCTS}`);

  console.log("[run-migration] Starting discovery…");
  const discoverResp = await axios.post(`${ETL_BASE}/discover`, { dryRun: true });
  const mappingPath = discoverResp.data?.mapping;
  const mappingJobId = discoverResp.data?.jobId;

  if (!mappingPath) {
    throw new Error("Discovery response missing mapping path");
  }

  console.log(`[run-migration] Discovery job=${mappingJobId}, mapping=${mappingPath}`);

  const migrateBody = {
    dryRun: false,
    resumeFromCheckpoint: false,
    maxProducts: MAX_PRODUCTS,
    mappingPath,
    mappingJobId,
  };

  console.log("[run-migration] Triggering migrate job…");
  const migrateResp = await axios.post(`${ETL_BASE}/migrate`, migrateBody);
  const migrateJobId = migrateResp.data?.jobId;
  if (!migrateJobId) {
    throw new Error("Migration response missing jobId");
  }
  console.log(`[run-migration] Migrate job=${migrateJobId}`);

  const startedAt = Date.now();
  while (true) {
    const statusResp = await axios.get(`${ETL_BASE}/jobs/${migrateJobId}`);
    const { status, progress, errors } = statusResp.data ?? {};

    console.log(
      `[run-migration] status=${status} stage=${progress?.stage ?? "n/a"} message=${progress?.message ?? ""}`
    );

    if (status === "completed") {
      console.log("[run-migration] Migration completed successfully.");
      break;
    }
    if (status === "failed") {
      console.error("[run-migration] Migration failed.", errors ?? progress);
      throw new Error("Migration job failed");
    }
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error("Timed out waiting for migration job to finish");
    }

    await wait(POLL_INTERVAL_MS);
  }
}

if (require.main === module) {
  run()
    .then(() => {
      console.log("[run-migration] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[run-migration] Error:", err?.message ?? err);
      process.exit(1);
    });
}

module.exports = run;

