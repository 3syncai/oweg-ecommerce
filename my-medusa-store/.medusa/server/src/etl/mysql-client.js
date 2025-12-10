"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.closePool = closePool;
exports.listTables = listTables;
exports.describeTable = describeTable;
exports.streamQuery = streamQuery;
exports.runQuery = runQuery;
exports.ensureReadOnly = ensureReadOnly;
const promise_1 = __importDefault(require("mysql2/promise"));
const config_1 = require("./config");
const logger_1 = require("./logger");
let pool = null;
async function getPool() {
    if (pool) {
        return pool;
    }
    if (!config_1.config.mysql.uri && !config_1.config.mysql.host) {
        throw new Error("SOURCE_MYSQL or OC_HOST must be provided to connect to OpenCart database.");
    }
    if (config_1.config.mysql.uri) {
        pool = promise_1.default.createPool({
            uri: config_1.config.mysql.uri,
            connectionLimit: config_1.config.mysql.connectionLimit,
            multipleStatements: false,
            waitForConnections: true,
        });
        return pool;
    }
    pool = promise_1.default.createPool({
        host: config_1.config.mysql.host,
        port: config_1.config.mysql.port,
        user: config_1.config.mysql.user,
        password: config_1.config.mysql.password,
        database: config_1.config.mysql.database,
        connectionLimit: config_1.config.mysql.connectionLimit,
        waitForConnections: true,
        multipleStatements: false,
    });
    return pool;
}
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
async function listTables() {
    const mysqlPool = await getPool();
    const [rows] = await mysqlPool.query(`
    SELECT table_name, table_schema
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
    return rows.map((row) => ({
        tableName: String(row.table_name),
        tableSchema: String(row.table_schema),
    }));
}
async function describeTable(tableName) {
    const mysqlPool = await getPool();
    const [rows] = await mysqlPool.query(`SHOW FULL COLUMNS FROM \`${tableName}\``);
    return rows.map((row) => ({
        Field: String(row.Field),
        Type: String(row.Type),
        Null: row.Null,
        Key: row.Key ? String(row.Key) : undefined,
        Default: row.Default !== undefined && row.Default !== null
            ? String(row.Default)
            : null,
        Extra: row.Extra ? String(row.Extra) : undefined,
    }));
}
async function streamQuery(query, params, onRow) {
    const mysqlPool = await getPool();
    const connection = await mysqlPool.getConnection();
    try {
        const [rows] = await connection.query(query, params);
        for (const row of rows) {
            await onRow(row);
        }
    }
    finally {
        connection.release();
    }
}
async function runQuery(query, params = []) {
    const mysqlPool = await getPool();
    const [rows] = await mysqlPool.query(query, params);
    return rows;
}
async function ensureReadOnly() {
    if (!config_1.config.mysql.readOnly) {
        await logger_1.logger.warn({
            message: "MySQL connection is not flagged as read-only.",
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXlzcWwtY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9teXNxbC1jbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFNQSwwQkErQkM7QUFFRCw4QkFLQztBQUVELGdDQWlCQztBQUVELHNDQTJCQztBQUVELGtDQWVDO0FBRUQsNEJBT0M7QUFFRCx3Q0FNQztBQTlIRCw2REFBNEQ7QUFDNUQscUNBQWtDO0FBQ2xDLHFDQUFrQztBQUVsQyxJQUFJLElBQUksR0FBZ0IsSUFBSSxDQUFDO0FBRXRCLEtBQUssVUFBVSxPQUFPO0lBQzNCLElBQUksSUFBSSxFQUFFLENBQUM7UUFDVCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFDRCxJQUFJLENBQUMsZUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxlQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzVDLE1BQU0sSUFBSSxLQUFLLENBQ2IsMkVBQTJFLENBQzVFLENBQUM7SUFDSixDQUFDO0lBRUQsSUFBSSxlQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLElBQUksR0FBRyxpQkFBSyxDQUFDLFVBQVUsQ0FBQztZQUN0QixHQUFHLEVBQUUsZUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHO1lBQ3JCLGVBQWUsRUFBRSxlQUFNLENBQUMsS0FBSyxDQUFDLGVBQWU7WUFDN0Msa0JBQWtCLEVBQUUsS0FBSztZQUN6QixrQkFBa0IsRUFBRSxJQUFJO1NBQ3pCLENBQUMsQ0FBQztRQUNILE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELElBQUksR0FBRyxpQkFBSyxDQUFDLFVBQVUsQ0FBQztRQUN0QixJQUFJLEVBQUUsZUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJO1FBQ3ZCLElBQUksRUFBRSxlQUFNLENBQUMsS0FBSyxDQUFDLElBQUk7UUFDdkIsSUFBSSxFQUFFLGVBQU0sQ0FBQyxL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