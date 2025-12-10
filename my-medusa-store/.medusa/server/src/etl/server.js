"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const job_manager_1 = require("./job-manager");
const config_1 = require("./config");
const discovery_1 = require("./discovery");
const backup_1 = require("./backup");
const mapping_1 = require("./mapping");
const migration_1 = require("./migration");
const report_1 = require("./report");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
async function bootstrap() {
    await (0, utils_1.ensureDir)(config_1.config.paths.dataDir);
    await Promise.all([
        (0, utils_1.ensureDir)(config_1.config.paths.jobsDir),
        (0, utils_1.ensureDir)(config_1.config.paths.mappingsDir),
        (0, utils_1.ensureDir)(config_1.config.paths.checkpointsDir),
        (0, utils_1.ensureDir)(config_1.config.paths.reportsDir),
        (0, utils_1.ensureDir)(config_1.config.paths.backupsDir),
    ]);
    await (0, job_manager_1.loadExistingJobs)();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(body_parser_1.default.json({ limit: "5mb" }));
    app.get("/health", (_req, res) => {
        res.json({ ok: true, timestamp: new Date().toISOString() });
    });
    const handleDiscover = async (_req, res) => {
        try {
            const job = await (0, job_manager_1.createJob)("discover", {});
            await (0, job_manager_1.updateJobStatus)(job.id, "running", {
                progress: { message: "Discovering schema", stage: "discover" },
            });
            const result = await (0, discovery_1.discoverSchema)();
            const mappingPath = await (0, mapping_1.generateMapping)(job.id);
            await (0, job_manager_1.updateJobStatus)(job.id, "completed", {
                artifacts: {
                    mapping: mappingPath,
                },
                progress: { message: "Discovery completed", stage: "discover" },
            });
            res.json({
                jobId: job.id,
                result,
                mapping: mappingPath,
            });
        }
        catch (error) {
            await logger_1.logger.error({
                message: "Discovery failed",
                error: error?.message,
            });
            res.status(500).json({ error: error?.message ?? "Unknown error" });
        }
    };
    app.post("/discover", handleDiscover);
    app.get("/discover", handleDiscover);
    app.post("/export", async (req, res) => {
        const params = req.body;
        if (!params?.tables?.length) {
            res.status(400).json({ error: "tables array is required" });
            return;
        }
        const job = await (0, job_manager_1.createJob)("backup", { ...params });
        res.json({ jobId: job.id });
        (async () => {
            try {
                await (0, job_manager_1.updateJobStatus)(job.id, "running");
                await (0, backup_1.runBackup)({
                    jobId: job.id,
                    tables: params.tables,
                    includeSchema: params.includeSchema ?? true,
                    compress: params.compress ?? true,
                });
                await (0, job_manager_1.updateJobStatus)(job.id, "completed");
            }
            catch (error) {
                await logger_1.logger.error({
                    jobId: job.id,
                    step: "backup",
                    message: "Backup job failed",
                    error: error?.message,
                });
                await (0, job_manager_1.updateJobStatus)(job.id, "failed", {
                    progress: { message: error?.message ?? "Backup failed" },
                });
            }
        })();
    });
    app.get("/job/:id/status", async (req, res) => {
        const job = await (0, job_manager_1.getJob)(req.params.id);
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        res.json(job);
    });
    app.get("/jobs/:id", async (req, res) => {
        const job = await (0, job_manager_1.getJob)(req.params.id);
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        res.json({
            id: job.id,
            kind: job.kind,
            status: job.status,
            progress: job.progress,
            errors: job.errors,
            artifacts: job.artifacts,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
        });
    });
    app.post("/migrate", async (req, res) => {
        const params = req.body;
        const job = await (0, job_manager_1.createJob)("migrate", { ...params });
        res.json({ jobId: job.id });
        (async () => {
            try {
                await (0, job_manager_1.updateJobStatus)(job.id, "running", {
                    progress: { stage: "migrate", message: "Initializing migration" },
                });
                await (0, migration_1.runMigration)(job.id, params);
                await (0, job_manager_1.updateJobStatus)(job.id, "completed", {
                    progress: { stage: "migrate", message: "Migration complete" },
                });
            }
            catch (error) {
                await logger_1.logger.error({
                    jobId: job.id,
                    step: "migrate",
                    message: "Migration job failed",
                    error: error?.message,
                });
                await (0, job_manager_1.updateJobStatus)(job.id, "failed", {
                    progress: { message: error?.message ?? "Migration failed" },
                });
            }
        })();
    });
    app.get("/report/:id", async (req, res) => {
        const jobId = req.params.id;
        const format = req.query.format ?? "json";
        try {
            await (0, job_manager_1.updateJobProgress)(jobId, {
                stage: "report",
                message: `Generating ${format.toUpperCase()} report`,
            });
            const reportPath = await (0, report_1.generateReport)(jobId, format);
            if (format === "csv") {
                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", `attachment; filename="${jobId}-report.csv"`);
                res.sendFile(reportPath, (error) => {
                    if (error) {
                        res
                            .status(500)
                            .json({ error: error?.message ?? "Report download failed" });
                    }
                });
                return;
            }
            const payload = await (0, utils_1.readJson)(reportPath);
            if (!payload) {
                res.status(500).json({ error: "Report file missing" });
                return;
            }
            res.json({ jobId, format, report: payload, reportPath });
        }
        catch (error) {
            res
                .status(500)
                .json({ error: error?.message ?? "Report generation failed" });
        }
    });
    const server = app.listen(config_1.config.api.port, config_1.config.api.host, () => {
        // eslint-disable-next-line no-console
        console.log(`[opencart-etl] API listening on http://${config_1.config.api.host}:${config_1.config.api.port}`);
    });
    await new Promise((resolve) => {
        const shutdown = () => {
            server.close(() => resolve());
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    });
}
if (require.main === module) {
    bootstrap().catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[opencart-etl] Server failed to start", error);
        process.exit(1);
    });
}
exports.default = bootstrap;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzREFBOEI7QUFDOUIsOERBQXFDO0FBQ3JDLGdEQUF3QjtBQUN4QiwrQ0FNdUI7QUFDdkIscUNBQWtDO0FBQ2xDLDJDQUE2QztBQUM3QyxxQ0FBcUM7QUFDckMsdUNBQTRDO0FBQzVDLDJDQUEyQztBQUMzQyxxQ0FBMEM7QUFDMUMscUNBQWtDO0FBQ2xDLG1DQUE4QztBQUc5QyxLQUFLLFVBQVUsU0FBUztJQUN0QixNQUFNLElBQUEsaUJBQVMsRUFBQyxlQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3RDLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQztRQUNoQixJQUFBLGlCQUFTLEVBQUMsZUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUM7UUFDL0IsSUFBQSxpQkFBUyxFQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDO1FBQ25DLElBQUEsaUJBQVMsRUFBQyxlQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQztRQUN0QyxJQUFBLGlCQUFTLEVBQUMsZUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUM7UUFDbEMsSUFBQSxpQkFBUyxFQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO0tBQ25DLENBQUMsQ0FBQztJQUNILE1BQU0sSUFBQSw4QkFBZ0IsR0FBRSxDQUFDO0lBRXpCLE1BQU0sR0FBRyxHQUFHLElBQUEsaUJBQU8sR0FBRSxDQUFDO0lBQ3RCLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBQSxjQUFJLEdBQUUsQ0FBQyxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRTNDLEdBQUcsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQy9CLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM5RCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sY0FBYyxHQUFHLEtBQUssRUFDMUIsSUFBcUIsRUFDckIsR0FBcUIsRUFDckIsRUFBRTtRQUNGLElBQUksQ0FBQztZQUNILE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBQSx1QkFBUyxFQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM1QyxNQUFNLElBQUEsNkJBQWUsRUFBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRTtnQkFDdkMsUUFBUSxFQUFFLEVBQUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUU7YUFDL0QsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFjLEdBQUUsQ0FBQztZQUN0QyxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUEseUJBQWUsRUFBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbEQsTUFBTSxJQUFBLDZCQUFlLEVBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxXQUFXLEVBQUU7Z0JBQ3pDLFNBQVMsRUFBRTtvQkFDVCxPQUFPLEVBQUUsV0FBVztpQkFDckI7Z0JBQ0QsUUFBUSxFQUFFLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUU7YUFDaEUsQ0FBQyxDQUFDO1lBQ0gsR0FBRyxDQUFDLElBQUksQ0FBQztnQkFDUCxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUU7Z0JBQ2IsTUFBTTtnQkFDTixPQUFPLEVBQUUsV0FBVzthQUNyQixDQUFDLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNwQixNQUFNLGVBQU0sQ0FBQyxLQUFLLENBQUM7Z0JBQ2pCLE9BQU8sRUFBRSxrQkFBa0I7Z0JBQzNCLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTzthQUN0QixDQUFDLENBQUM7WUFDSCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDckUsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ3RDLEdBQUcsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBRXJDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDckMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQXVCLENBQUM7UUFDM0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDNUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1lBQzVELE9BQU87UUFDVCxDQUFDO1FBQ0QsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFBLHVCQUFTLEVBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUIsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUNWLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUEsNkJBQWUsRUFBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUN6QyxNQUFNLElBQUEsa0JBQVMsRUFBQztvQkFDZCxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUU7b0JBQ2IsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO29CQUNyQixhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWEsSUFBSSxJQUFJO29CQUMzQyxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsSUFBSSxJQUFJO2lCQUNsQyxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxJQUFBLDZCQUFlLEVBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUM3QyxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIsTUFBTSxlQUFNLENBQUMsS0FBSyxDQUFDO29CQUNqQixLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUU7b0JBQ2IsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsT0FBTyxFQUFFLG1CQUFtQjtvQkFDNUIsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPO2lCQUN0QixDQUFDLENBQUM7Z0JBQ0gsTUFBTSxJQUFBLDZCQUFlLEVBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUU7b0JBQ3RDLFFBQVEsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxJQUFJLGVBQWUsRUFBRTtpQkFDekQsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILEdBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUM1QyxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUEsb0JBQU0sRUFBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNULEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDakQsT0FBTztRQUNULENBQUM7UUFDRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBRUgsR0FBRyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUN0QyxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUEsb0JBQU0sRUFBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNULEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDakQsT0FBTztRQUNULENBQUM7UUFDRCxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ1AsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQ1YsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJO1lBQ2QsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNO1lBQ2xCLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUTtZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU07WUFDbEIsU0FBUyxFQUFFLEdBQUcsQ0FBQyxTQUFTO1lBQ3hCLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUztZQUN4QixTQUFTLEVBQUUsR0FBRyxDQUFDLFNBQVM7WUFDeEIsU0FBUyxFQUFFLEdBQUcsQ0FBQyxTQUFTO1lBQ3hCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVTtTQUMzQixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDdEMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQXdCLENBQUM7UUFDNUMsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFBLHVCQUFTLEVBQUMsU0FBUyxFQUFFLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFNUIsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUNWLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUEsNkJBQWUsRUFBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRTtvQkFDdkMsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUU7aUJBQ2xFLENBQUMsQ0FBQztnQkFDSCxNQUFNLElBQUEsd0JBQVksRUFBQyxHQUFHLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNuQyxNQUFNLElBQUEsNkJBQWUsRUFBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFdBQVcsRUFBRTtvQkFDekMsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUU7aUJBQzlELENBQUMsQ0FBQztZQUNMLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNwQixNQUFNLGVBQU0sQ0FBQyxLQUFLLENBQUM7b0JBQ2pCLEtBQUssRUFBRSxHQUFHLENBQUMsRUFBRTtvQkFDYixJQUFJLEVBQUUsU0FBUztvQkFDZixPQUFPLEVBQUUsc0JBQXNCO29CQUMvQixLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU87aUJBQ3RCLENBQUMsQ0FBQztnQkFDSCxNQUFNLElBQUEsNkJBQWUsRUFBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRTtvQkFDdEMsUUFBUSxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUksa0JBQWtCLEVBQUU7aUJBQzVELENBQUMsQ0FBQztZQUNMLENBQUM7UUFDSCxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxHQUFHLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ3hDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQzVCLE1BQU0sTUFBTSxHQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBeUIsSUFBSSxNQUFNLENBQUM7UUFDOUQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxJQUFBLCtCQUFpQixFQUFDLEtBQUssRUFBRTtnQkFDN0IsS0FBSyxFQUFFLFFBQVE7Z0JBQ2YsT0FBTyxFQUFFLGNBQWMsTUFBTSxDQUFDLFdBQVcsRUFBRSxTQUFTO2FBQ3JELENBQUMsQ0FBQztZQUNILE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBQSx1QkFBYyxFQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUN2RCxJQUFJLE1BQU0sS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDckIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQzFDLEdBQUcsQ0FBQyxTQUFTLENBQ1gscUJBQXFCLEVBQ3JCLHlCQUF5QixLQUFLLGNBQWMsQ0FDN0MsQ0FBQztnQkFDRixHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO29CQUNqQyxJQUFJLEtBQUssRUFBRSxDQUFDO3dCQUNWLEdBQUc7NkJBQ0EsTUFBTSxDQUFDLEdBQUcsQ0FBQzs2QkFDWCxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU8sSUFBSSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7b0JBQ2pFLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsT0FBTztZQUNULENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsZ0JBQVEsRUFBTSxVQUFVLENBQUMsQ0FBQztZQUNoRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RCxPQUFPO1lBQ1QsQ0FBQztZQUNELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNwQixHQUFHO2lCQUNBLE1BQU0sQ0FBQyxHQUFHLENBQUM7aUJBQ1gsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPLElBQUksMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsZUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQy9ELHNDQUFzQztRQUN0QyxPQUFPLENBQUMsR0FBRyxDQUNULDBDQUEwQyxlQUFNLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxlQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUMvRSxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDbEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxFQUFFO1lBQ3BCLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUM7UUFFRixPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNqQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNwQyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7SUFDNUIsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7UUFDMUIsc0NBQXNDO1FBQ3RDLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUQsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxrQkFBZSxTQUFTLENBQUMifQ==