import mysql, { Pool, RowDataPacket } from "mysql2/promise";
import { config } from "./config";
import { logger } from "./logger";

let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (pool) {
    return pool;
  }
  if (!config.mysql.uri && !config.mysql.host) {
    throw new Error(
      "SOURCE_MYSQL or OC_HOST must be provided to connect to OpenCart database."
    );
  }

  if (config.mysql.uri) {
    pool = mysql.createPool({
      uri: config.mysql.uri,
      connectionLimit: config.mysql.connectionLimit,
      multipleStatements: false,
      waitForConnections: true,
    });
    return pool;
  }

  pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    connectionLimit: config.mysql.connectionLimit,
    waitForConnections: true,
    multipleStatements: false,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function listTables(): Promise<
  Array<{ tableName: string; tableSchema: string }>
> {
  const mysqlPool = await getPool();
  const [rows] = await mysqlPool.query<RowDataPacket[]>(
    `
    SELECT table_name, table_schema
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  );
  return rows.map((row) => ({
    tableName: String(row.table_name),
    tableSchema: String(row.table_schema),
  }));
}

export async function describeTable(
  tableName: string
): Promise<
  Array<{
    Field: string;
    Type: string;
    Null: "YES" | "NO";
    Key?: string;
    Default?: string | null;
    Extra?: string;
  }>
> {
  const mysqlPool = await getPool();
  const [rows] = await mysqlPool.query<RowDataPacket[]>(
    `SHOW FULL COLUMNS FROM \`${tableName}\``
  );
  return rows.map((row) => ({
    Field: String(row.Field),
    Type: String(row.Type),
    Null: row.Null as "YES" | "NO",
    Key: row.Key ? String(row.Key) : undefined,
    Default:
      row.Default !== undefined && row.Default !== null
        ? String(row.Default)
        : null,
    Extra: row.Extra ? String(row.Extra) : undefined,
  }));
}

export async function streamQuery(
  query: string,
  params: unknown[],
  onRow: (row: RowDataPacket) => Promise<void>
): Promise<void> {
  const mysqlPool = await getPool();
  const connection = await mysqlPool.getConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    for (const row of rows) {
      await onRow(row);
    }
  } finally {
    connection.release();
  }
}

export async function runQuery<T extends RowDataPacket[]>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  const mysqlPool = await getPool();
  const [rows] = await mysqlPool.query<T>(query, params);
  return rows;
}

export async function ensureReadOnly(): Promise<void> {
  if (!config.mysql.readOnly) {
    await logger.warn({
      message: "MySQL connection is not flagged as read-only.",
    });
  }
}


