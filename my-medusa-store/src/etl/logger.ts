import { appendLog } from "./utils";
import { config } from "./config";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  jobId?: string;
  step?: string;
  rowId?: string | number;
  message: string;
  [key: string]: unknown;
}

const consoleLevelPriority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const configuredLevel =
  (process.env.OPENCART_ETL_LOG_LEVEL as LogLevel) ?? "info";

const shouldLogToConsole = (level: LogLevel) =>
  consoleLevelPriority[level] <= consoleLevelPriority[configuredLevel];

export async function log(level: LogLevel, payload: LogPayload): Promise<void> {
  const entry = { level, ...payload };
  if (shouldLogToConsole(level)) {
    const { message, ...rest } = entry;
    // eslint-disable-next-line no-console
    console.log(
      `[${level.toUpperCase()}] ${message}${
        Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""
      }`
    );
  }
  await appendLog(
    `${config.paths.dataDir}/opencart-etl.log`,
    entry as Record<string, unknown>
  );
}

export const logger = {
  info: (payload: LogPayload) => log("info", payload),
  warn: (payload: LogPayload) => log("warn", payload),
  error: (payload: LogPayload) => log("error", payload),
  debug: (payload: LogPayload) => log("debug", payload),
};


