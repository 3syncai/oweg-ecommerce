import "dotenv/config";
import path from "path";
import {
  ETL_DIR,
  JOBS_DIR,
  MAPPINGS_DIR,
  CHECKPOINTS_DIR,
  REPORTS_DIR,
  LOG_FILE,
} from "./paths";

export type StorageProvider = "s3" | "r2" | "gcs";

const workspaceRoot = path.resolve(__dirname, "..", "..");

const defaultDataDir = path.resolve(workspaceRoot, "..", "opencart-etl-data");

const resolveDataDir = (): string => {
  const configured = process.env.OPENCART_ETL_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return defaultDataDir;
};

const baseDataDir = resolveDataDir();

const ensureString = (
  value: string | undefined,
  fallback?: string
): string | undefined => {
  if (value && value.trim()) {
    return value.trim();
  }
  return fallback;
};

const parseBoolean = (value: string | undefined, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
};

const parseNumber = (
  value: string | undefined,
  defaultValue: number
): number => {
  if (!value) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return parsed;
};

export const config = {
  mysql: {
    uri: ensureString(process.env.SOURCE_MYSQL),
    host: process.env.OC_HOST,
    port: parseNumber(process.env.OC_PORT, 3306),
    user: process.env.OC_USER,
    password: process.env.OC_PASSWORD,
    database: process.env.OC_DATABASE,
    tablePrefix: process.env.OC_TABLE_PREFIX ?? "oc_",
    languageId: parseNumber(process.env.OC_LANGUAGE_ID, 1),
    storeId: parseNumber(process.env.OC_STORE_ID, 0),
    imageBaseUrl: ensureString(process.env.OC_IMAGE_BASE_URL),
    connectionLimit: parseNumber(process.env.DB_CONNECTION_LIMIT, 5),
    readOnly: parseBoolean(process.env.OC_READ_ONLY, true),
  },
  postgres: {
    uri: ensureString(process.env.TARGET_POSTGRES),
    ssl: parseBoolean(process.env.PG_SSL, false),
  },
  storage: {
    provider: (process.env.OBJECT_STORAGE_PROVIDER as StorageProvider) ?? "s3",
    bucket: ensureString(process.env.OBJECT_STORAGE_BUCKET),
    basePath: ensureString(process.env.OBJECT_STORAGE_BASE_PATH, "opencart"),
  },
  medusa: {
    adminUrl: ensureString(
      process.env.MEDUSA_ADMIN_API ?? process.env.MEDUSA_URL
    ),
    token: ensureString(
      process.env.MEDUSA_ADMIN_TOKEN ?? process.env.MEDUSA_API_TOKEN
    ),
    dryRun: parseBoolean(process.env.OPENCART_ETL_DRY_RUN, false),
    defaultCurrency: (
      process.env.MEDUSA_CURRENCY_CODE ??
      process.env.CURRENCY ??
      "inr"
    ).toLowerCase(),
    stockLocationId: ensureString(process.env.MEDUSA_LOCATION_ID),
    defaultSalesChannelId: ensureString(
      process.env.MEDUSA_DEFAULT_SALES_CHANNEL_ID
    ),
  },
  api: {
    port: parseNumber(process.env.OPENCART_ETL_PORT, 7070),
    host: process.env.OPENCART_ETL_HOST ?? "0.0.0.0",
  },
  paths: {
    dataDir: ETL_DIR,
    jobsDir: JOBS_DIR,
    backupsDir: path.join(ETL_DIR, "backups"),
    checkpointsDir: CHECKPOINTS_DIR,
    reportsDir: REPORTS_DIR,
    mappingsDir: MAPPINGS_DIR,
    logFile: LOG_FILE,
  },
  worker: {
    imageConcurrency: parseNumber(
      process.env.OPENCART_ETL_IMAGE_CONCURRENCY,
      8
    ),
    batchSize: parseNumber(process.env.OPENCART_ETL_BATCH_SIZE, 200),
    retryLimit: parseNumber(process.env.OPENCART_ETL_RETRY_LIMIT, 3),
    retryBackoffMs: parseNumber(
      process.env.OPENCART_ETL_RETRY_BACKOFF_MS,
      1500
    ),
  },
};

export type ConfigShape = typeof config;

// --- Medusa admin base + auth headers (v2) ---

export const MEDUSA_URL = process.env.MEDUSA_URL ?? "http://localhost:9000";

/** Build headers for admin requests.
 * Supports:
 *   - BASIC  : Authorization: "Basic <secret>"
 *   - API KEY: Authorization: "ApiKey <secret>"  (+ x-medusa-access-token)
 */
export function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const scheme = (
    process.env.MEDUSA_ADMIN_AUTH_SCHEME ?? "basic"
  ).toLowerCase();
  if (scheme === "basic" && process.env.MEDUSA_ADMIN_BASIC) {
    h["Authorization"] = `Basic ${process.env.MEDUSA_ADMIN_BASIC}`;
  } else if (process.env.MEDUSA_ADMIN_TOKEN) {
    h["Authorization"] = `ApiKey ${process.env.MEDUSA_ADMIN_TOKEN}`;
    h["x-medusa-access-token"] = process.env.MEDUSA_ADMIN_TOKEN!;
  }
  return h;
}
