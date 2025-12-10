"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBackup = runBackup;
const fs_1 = __importDefault(require("fs"));
const fs_2 = require("fs");
const zlib_1 = require("zlib");
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const job_manager_1 = require("./job-manager");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const mysql_client_1 = require("./mysql-client");
async function exportTableToCsv(connection, tableName, destination, compress, batchSize) {
    await (0, utils_1.ensureDir)(path_1.default.dirname(destination));
    const fileStream = (0, fs_2.createWriteStream)(destination);
    const writer = compress
        ? (0, zlib_1.createGzip)().pipe(fileStream)
        : fileStream;
    const write = (content) => {
        if (!writer.write(content)) {
            return new Promise((resolve) => writer.once("drain", resolve));
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
            const record = row;
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
    await new Promise((resolve, reject) => {
        writer.end(() => resolve());
        writer.on("error", reject);
    });
    return destination;
}
async function exportTableSchema(connection, tableName, destination) {
    await (0, utils_1.ensureDir)(path_1.default.dirname(destination));
    const [rows] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (row) {
        const createStatement = row[`Create Table`] ?? row[`Create View`] ?? row[`Create Table`];
        await fs_1.default.promises.writeFile(destination, `${createStatement};\n`, "utf8");
    }
    return destination;
}
async function runBackup({ jobId, tables, includeSchema, compress, }) {
    const pool = await (0, mysql_client_1.getPool)();
    let connection = null;
    try {
        connection = await pool.getConnection();
        for (let index = 0; index < tables.length; index += 1) {
            const table = tables[index];
            await logger_1.logger.info({
                jobId,
                step: "backup",
                message: `Exporting table ${table} (${index + 1}/${tables.length})`,
            });
            const baseName = (0, utils_1.safeFilename)(table);
            const backupDir = path_1.default.join(config_1.config.paths.backupsDir, jobId);
            await (0, utils_1.ensureDir)(backupDir);
            const csvPath = path_1.default.join(backupDir, `${baseName}.csv${compress ? ".gz" : ""}`);
            const schemaPath = path_1.default.join(backupDir, `${baseName}.schema.sql`);
            await exportTableToCsv(connection, table, csvPath, compress, config_1.config.worker.batchSize);
            const csvHash = await (0, utils_1.sha256File)(csvPath);
            await (0, job_manager_1.attachArtifact)(jobId, `${table}:csv`, csvPath);
            await (0, job_manager_1.attachArtifact)(jobId, `${table}:csv:sha256`, csvHash);
            if (includeSchema) {
                await exportTableSchema(connection, table, schemaPath);
                const schemaHash = await (0, utils_1.sha256File)(schemaPath);
                await (0, job_manager_1.attachArtifact)(jobId, `${table}:schema`, schemaPath);
                await (0, job_manager_1.attachArtifact)(jobId, `${table}:schema:sha256`, schemaHash);
            }
            await (0, job_manager_1.updateJobProgress)(jobId, {
                total: tables.length,
                processed: index + 1,
                percentage: Math.round(((index + 1) / tables.length) * 100),
                stage: "backup",
                message: `Backed up ${table}`,
            });
        }
    }
    finally {
        if (connection) {
            connection.release();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja3VwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9iYWNrdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFrR0EsOEJBNERDO0FBOUpELDRDQUFvQjtBQUNwQiwyQkFBdUM7QUFFdkMsK0JBQWtDO0FBQ2xDLGdEQUF3QjtBQUd4QixxQ0FBa0M7QUFDbEMsK0NBQWtFO0FBQ2xFLHFDQUFrQztBQUNsQyxtQ0FBOEQ7QUFDOUQsaURBQXlDO0FBU3pDLEtBQUssVUFBVSxnQkFBZ0IsQ0FDN0IsVUFBaUMsRUFDakMsU0FBaUIsRUFDakIsV0FBbUIsRUFDbkIsUUFBaUIsRUFDakIsU0FBaUI7SUFFakIsTUFBTSxJQUFBLGlCQUFTLEVBQUMsY0FBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRTNDLE1BQU0sVUFBVSxHQUFHLElBQUEsc0JBQWlCLEVBQUMsV0FBVyxDQUFDLENBQUM7SUFDbEQsTUFBTSxNQUFNLEdBQWEsUUFBUTtRQUMvQixDQUFDLENBQUMsSUFBQSxpQkFBVSxHQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUMvQixDQUFDLENBQUMsVUFBVSxDQUFDO0lBRWYsTUFBTSxLQUFLLEdBQUcsQ0FBQyxPQUFlLEVBQUUsRUFBRTtRQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzNCLE9BQU8sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDdkUsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzNCLENBQUMsQ0FBQztJQUVGLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztJQUUxQixNQUFNLFNBQVMsR0FBRyxtQkFBbUIsU0FBUyxxQkFBcUIsQ0FBQztJQUNw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