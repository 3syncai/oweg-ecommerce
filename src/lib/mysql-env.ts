/**
 * Enhanced MySQL Configuration with Environment Variables
 * Use this version if you want to load credentials from environment variables
 * instead of hardcoding them
 */
import mysql from 'mysql2/promise';

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  waitForConnections: boolean;
  queueLimit: number;
  enableKeepAlive: boolean;
  keepAliveInitialDelay: number;
}

/**
 * Load database configuration from environment variables
 * Falls back to default values if environment variables are not set
 */
function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST || '147.93.31.253',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'oweg_user2',
    password: process.env.DB_PASSWORD || 'Oweg#@123',
    database: process.env.DB_NAME || 'oweg_db',
    connectionLimit: parseInt(
      process.env.DB_CONNECTION_LIMIT || '10',
      10
    ),
    waitForConnections: process.env.DB_WAIT_FOR_CONNECTIONS !== 'false',
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '0', 10),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

// Create a connection pool
let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = getDbConfig();
    pool = mysql.createPool(config);
    
    // Log connection attempt (without sensitive data)
    console.log('MySQL pool created:', {
      host: config.host,
      database: config.database,
      user: config.user,
    });
  }
  return pool;
}

export async function executeReadQuery<T = unknown>(
  query: string,
  params: (string | number | boolean | null)[] = []
): Promise<T> {
  const normalizedQuery = query.trim().toUpperCase();
  const writeOperations = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'TRUNCATE',
    'ALTER',
    'CREATE',
    'REPLACE',
    'GRANT',
    'REVOKE',
  ];

  for (const operation of writeOperations) {
    if (normalizedQuery.startsWith(operation)) {
      throw new Error(
        `Security Error: ${operation} operations are not allowed. This is a read-only connection.`
      );
    }
  }

  try {
    const connection = await getPool().getConnection();
    try {
      const [rows] = await connection.execute(query, params);
      return rows as T;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error(
      error instanceof Error
        ? `Database Error: ${error.message}`
        : 'Unknown database error'
    );
  }
}

export function escapeIdentifier(identifier: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(identifier)) {
    throw new Error('Invalid identifier format');
  }
  return mysql.escapeId(identifier);
}

export function sanitizeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, '\\$&');
}

export function validatePagination(
  limit?: number | string,
  offset?: number | string
): { limit: number; offset: number } {
  const maxLimit = parseInt(
    process.env.API_MAX_PAGE_LIMIT || '100',
    10
  );
  const defaultLimit = parseInt(
    process.env.API_DEFAULT_PAGE_LIMIT || '20',
    10
  );

  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  const parsedOffset =
    typeof offset === 'string' ? parseInt(offset, 10) : offset;

  const validLimit = Math.min(
    Math.max(parsedLimit || defaultLimit, 1),
    maxLimit
  );
  const validOffset = Math.max(parsedOffset || 0, 0);

  return { limit: validLimit, offset: validOffset };
}

export async function getAllTables(): Promise<string[]> {
  const query = 'SHOW TABLES';
  const rows = await executeReadQuery<Array<Record<string, unknown>>>(query);
  return rows.map((row) => Object.values(row)[0] as string);
}

export async function getTableSchema(tableName: string): Promise<Array<Record<string, unknown>>> {
  const query = `DESCRIBE ${escapeIdentifier(tableName)}`;
  return await executeReadQuery(query);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('MySQL pool closed');
  }
}

