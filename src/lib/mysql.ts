import mysql from 'mysql2/promise';

/**
 * Secure MySQL Database Configuration
 * READ-ONLY connection to prevent any data modifications
 */

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

// Database configuration - Load from environment variables
const dbConfig: DbConfig = {
  host: process.env.DB_HOST || '147.93.31.253',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'oweg_user2',
  password: process.env.DB_PASSWORD || 'Oweg#@123',
  database: process.env.DB_NAME || 'oweg_db',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  waitForConnections: process.env.DB_WAIT_FOR_CONNECTIONS !== 'false',
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '0', 10),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Create a connection pool for better performance
let pool: mysql.Pool | null = null;

/**
 * Get or create MySQL connection pool
 * @returns MySQL Pool instance
 */
export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

/**
 * Execute a READ-ONLY query safely
 * Blocks any INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER operations
 * @param query SQL query string
 * @param params Query parameters for prepared statements
 * @returns Query results
 */
export async function executeReadQuery<T = unknown>(
  query: string,
  params: (string | number | boolean | null)[] = []
): Promise<T> {
  // Security: Block any write operations
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

/**
 * Safely escape and validate table/column names
 * @param identifier Table or column name
 * @returns Escaped identifier
 */
export function escapeIdentifier(identifier: string): string {
  // Only allow alphanumeric characters, underscores, and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(identifier)) {
    throw new Error('Invalid identifier format');
  }
  return mysql.escapeId(identifier);
}

/**
 * Sanitize LIKE patterns to prevent SQL injection
 * @param pattern Search pattern
 * @returns Sanitized pattern
 */
export function sanitizeLikePattern(pattern: string): string {
  // Escape special LIKE characters
  return pattern.replace(/[%_\\]/g, '\\$&');
}

/**
 * Validate pagination parameters
 * @param limit Number of records to return
 * @param offset Number of records to skip
 * @returns Validated limit and offset
 */
export function validatePagination(
  limit?: number | string,
  offset?: number | string
): { limit: number; offset: number } {
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  const parsedOffset =
    typeof offset === 'string' ? parseInt(offset, 10) : offset;

  const validLimit = Math.min(Math.max(parsedLimit || 20, 1), 100);
  const validOffset = Math.max(parsedOffset || 0, 0);

  return { limit: validLimit, offset: validOffset };
}

/**
 * Get all table names in the database
 * @returns Array of table names
 */
export async function getAllTables(): Promise<string[]> {
  const query = 'SHOW TABLES';
  const rows = await executeReadQuery<Array<Record<string, unknown>>>(query);
  return rows.map((row) => Object.values(row)[0] as string);
}

/**
 * Get table schema information
 * @param tableName Name of the table
 * @returns Table schema
 */
export async function getTableSchema(tableName: string): Promise<Array<Record<string, unknown>>> {
  const query = `DESCRIBE ${escapeIdentifier(tableName)}`;
  return await executeReadQuery(query);
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

