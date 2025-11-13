import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import {
  createJob,
  updateJobStatus,
  updateJobProgress,
  getJob,
  loadExistingJobs,
} from "./job-manager";
import { config } from "./config";
import { discoverSchema } from "./discovery";
import { runBackup } from "./backup";
import { generateMapping } from "./mapping";
import { runMigration } from "./migration";
import { generateReport } from "./report";
import { logger } from "./logger";
import { ensureDir, readJson } from "./utils";
import { ExportJobParams, MigrateJobParams } from "./types";

async function bootstrap(): Promise<void> {
  await ensureDir(config.paths.dataDir);
  await Promise.all([
    ensureDir(config.paths.jobsDir),
    ensureDir(config.paths.mappingsDir),
    ensureDir(config.paths.checkpointsDir),
    ensureDir(config.paths.reportsDir),
    ensureDir(config.paths.backupsDir),
  ]);
  await loadExistingJobs();

  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  const handleDiscover = async (
    _req: express.Request,
    res: express.Response
  ) => {
    try {
      const job = await createJob("discover", {});
      await updateJobStatus(job.id, "running", {
        progress: { message: "Discovering schema", stage: "discover" },
      });
      const result = await discoverSchema();
      const mappingPath = await generateMapping(job.id);
      await updateJobStatus(job.id, "completed", {
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
    } catch (error: any) {
      await logger.error({
        message: "Discovery failed",
        error: error?.message,
      });
      res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  };

  app.post("/discover", handleDiscover);
  app.get("/discover", handleDiscover);

  app.post("/export", async (req, res) => {
    const params = req.body as ExportJobParams;
    if (!params?.tables?.length) {
      res.status(400).json({ error: "tables array is required" });
      return;
    }
    const job = await createJob("backup", { ...params });
    res.json({ jobId: job.id });
    (async () => {
      try {
        await updateJobStatus(job.id, "running");
        await runBackup({
          jobId: job.id,
          tables: params.tables,
          includeSchema: params.includeSchema ?? true,
          compress: params.compress ?? true,
        });
        await updateJobStatus(job.id, "completed");
      } catch (error: any) {
        await logger.error({
          jobId: job.id,
          step: "backup",
          message: "Backup job failed",
          error: error?.message,
        });
        await updateJobStatus(job.id, "failed", {
          progress: { message: error?.message ?? "Backup failed" },
        });
      }
    })();
  });

  app.get("/job/:id/status", async (req, res) => {
    const job = await getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  app.get("/jobs/:id", async (req, res) => {
    const job = await getJob(req.params.id);
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
    const params = req.body as MigrateJobParams;
    const job = await createJob("migrate", { ...params });
    res.json({ jobId: job.id });

    (async () => {
      try {
        await updateJobStatus(job.id, "running", {
          progress: { stage: "migrate", message: "Initializing migration" },
        });
        await runMigration(job.id, params);
        await updateJobStatus(job.id, "completed", {
          progress: { stage: "migrate", message: "Migration complete" },
        });
      } catch (error: any) {
        await logger.error({
          jobId: job.id,
          step: "migrate",
          message: "Migration job failed",
          error: error?.message,
        });
        await updateJobStatus(job.id, "failed", {
          progress: { message: error?.message ?? "Migration failed" },
        });
      }
    })();
  });

  app.get("/report/:id", async (req, res) => {
    const jobId = req.params.id;
    const format = (req.query.format as "json" | "csv") ?? "json";
    try {
      await updateJobProgress(jobId, {
        stage: "report",
        message: `Generating ${format.toUpperCase()} report`,
      });
      const reportPath = await generateReport(jobId, format);
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${jobId}-report.csv"`
        );
        res.sendFile(reportPath, (error) => {
          if (error) {
            res
              .status(500)
              .json({ error: error?.message ?? "Report download failed" });
          }
        });
        return;
      }
      const payload = await readJson<any>(reportPath);
      if (!payload) {
        res.status(500).json({ error: "Report file missing" });
        return;
      }
      res.json({ jobId, format, report: payload, reportPath });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error?.message ?? "Report generation failed" });
    }
  });

  const server = app.listen(config.api.port, config.api.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[opencart-etl] API listening on http://${config.api.host}:${config.api.port}`
    );
  });

  await new Promise<void>((resolve) => {
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

export default bootstrap;
