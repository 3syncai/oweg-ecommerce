import fs from "fs/promises";
import path from "path";
import { Parser } from "@json2csv/plainjs";
import { config } from "./config";
import { readJson, writeJson, ensureDir } from "./utils";
import { attachArtifact } from "./job-manager";

interface ReportData {
  summary: {
    processed?: number;
    succeeded?: number;
    failed?: number;
    imagesUploaded?: number;
    imagesFailed?: number;
  };
  errors: Array<{ timestamp: string; message: string; stack?: string }>;
  checkpoints?: unknown;
}

export async function generateReport(
  jobId: string,
  format: "json" | "csv"
): Promise<string> {
  const jobsDir = path.join(config.paths.jobsDir);
  const jobFile = path.join(jobsDir, `${jobId}.json`);
  const job = await readJson<any>(jobFile);
  if (!job) {
    throw new Error(`Job ${jobId} not found for report generation.`);
  }

  const checkpointFile = path.join(
    config.paths.checkpointsDir,
    jobId,
    "checkpoint.json"
  );
  const checkpoint = await readJson<any>(checkpointFile);

  const data: ReportData = {
    summary: checkpoint ?? {},
    errors: job.errors ?? [],
    checkpoints: checkpoint,
  };

  const reportDir = path.join(config.paths.reportsDir, jobId);
  await ensureDir(reportDir);

  if (format === "json") {
    const filePath = path.join(reportDir, "report.json");
    await writeJson(filePath, data);
    await attachArtifact(jobId, "report_json", filePath);
    return filePath;
  }

  const parser = new Parser();
  const csv = parser.parse(
    (data.errors ?? []).map((error) => ({
      timestamp: error.timestamp,
      message: error.message,
      stack: error.stack,
    }))
  );
  const filePath = path.join(reportDir, "report.csv");
  await fs.writeFile(filePath, csv, "utf8");
  await attachArtifact(jobId, "report_csv", filePath);
  return filePath;
}


