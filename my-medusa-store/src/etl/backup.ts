import fs from "fs";
import { createWriteStream } from "fs";
import { Writable } from "stream";
import { createGzip } from "zlib";
import path from "path";
import mysql from "mysql2";
import { PoolConnection as PromisePoolConnection } from "mysql2/promise";
import { config } from "./config";
import { attachArtifact, updateJobProgress } from "./job-manager";
import { logger } from "./logger";
import { sha256File, ensureDir, safeFilename } from "./utils";
import { getPool } from "./mysql-client";

export interface BackupOptions {
  jobId: string;
  tables: string[];
  includeSchema: boolean;
  compress: boolean;
}

async function exportTableToCsv(
  connection: PromisePoolConnection,
  tableName: string,
  destination: string,
  compress: boolean,
  batchSize: number
): Promise<string> {
  await ensureDir(path.dirname(destination));

  const fileStream = createWriteStream(destination);
  const writer: Writable = compress
    ? createGzip().pipe(fileStream)
    : fileStream;

  const write = (content: string) => {
    if (!writer.write(content)) {
      return new Promise<void>((resolve) => writer.once("drain", resolve));
    }
    return Promise.resolve();
  };

  let headerWritten = false;

  const selectSql = `SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?`;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const [rows] = await connection.query(selectSql, [batchSize, offset]);
    const data = Array.isArray(rows) ? rows : [];
    for (const row of data) {
      const record = row as Record<string, unknown>;
      if (!headerWritten) {
        await write(Object.keys(record).join(",") + "\n");
        headerWritten = true;
      }
      const line = Object.values(record)
        .map((value) => {
          if (value === null || value === undefined) {
            return "";
          }
          const stringValue = String(value);
          if (/[","\n]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(",");
      await write(line + "\n");
    }
    hasMore = data.length === batchSize;
    offset += data.length;
  }

  await new Promise<void>((resolve, reject) => {
    writer.end(() => resolve());
    writer.on("error", reject);
  });

  return destination;
}

async function exportTableSchema(
  connection: PromisePoolConnection,
  tableName: string,
  destination: string
): Promise<string> {
  await ensureDir(path.dirname(destination));
  const [rows] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (row) {
    const createStatement =
      row[`Create Table`] ?? row[`Create View`] ?? row[`Create Table`];
    await fs.promises.writeFile(destination, `${createStatement};\n`, "utf8");
  }
  return destination;
}

export async function runBackup({
  jobId,
  tables,
  includeSchema,
  compress,
}: BackupOptions): Promise<void> {
  const pool = await getPool();
  let connection: PromisePoolConnection | null = null;

  try {
    connection = await pool.getConnection();
    for (let index = 0; index < tables.length; index += 1) {
      const table = tables[index];
      await logger.info({
        jobId,
        step: "backup",
        message: `Exporting table ${table} (${index + 1}/${tables.length})`,
      });

      const baseName = safeFilename(table);
      const backupDir = path.join(config.paths.backupsDir, jobId);
      await ensureDir(backupDir);
      const csvPath = path.join(
        backupDir,
        `${baseName}.csv${compress ? ".gz" : ""}`
      );
      const schemaPath = path.join(backupDir, `${baseName}.schema.sql`);

      await exportTableToCsv(
        connection,
        table,
        csvPath,
        compress,
        config.worker.batchSize
      );
      const csvHash = await sha256File(csvPath);

      await attachArtifact(jobId, `${table}:csv`, csvPath);
      await attachArtifact(jobId, `${table}:csv:sha256`, csvHash);

      if (includeSchema) {
        await exportTableSchema(connection, table, schemaPath);
        const schemaHash = await sha256File(schemaPath);
        await attachArtifact(jobId, `${table}:schema`, schemaPath);
        await attachArtifact(jobId, `${table}:schema:sha256`, schemaHash);
      }

      await updateJobProgress(jobId, {
        total: tables.length,
        processed: index + 1,
        percentage: Math.round(((index + 1) / tables.length) * 100),
        stage: "backup",
        message: `Backed up ${table}`,
      });
    }
  } finally {
    if (connection) {
    connection.release();
    }
  }
}
