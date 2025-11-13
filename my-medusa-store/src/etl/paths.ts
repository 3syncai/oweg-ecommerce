import path from "path";
import fs from "fs";

export const LOG_ROOT = process.env.ETL_LOG_DIR
  ? path.resolve(process.env.ETL_LOG_DIR)
  : path.resolve("C:/oweg-etl-logs"); // Windows-safe fallback

export const ETL_DIR = path.join(LOG_ROOT, "opencart-etl");
export const JOBS_DIR = path.join(ETL_DIR, "jobs");
export const MAPPINGS_DIR = path.join(ETL_DIR, "mappings");
export const CHECKPOINTS_DIR = path.join(ETL_DIR, "checkpoints");
export const REPORTS_DIR = path.join(ETL_DIR, "reports");
export const LOG_FILE = path.join(ETL_DIR, "opencart-etl.log");

// ensure dirs exist
for (const d of [ETL_DIR, JOBS_DIR, MAPPINGS_DIR, CHECKPOINTS_DIR, REPORTS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

