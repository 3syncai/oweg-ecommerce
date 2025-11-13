import { randomUUID } from "crypto";
import path from "path";
import { config } from "./config";
import {
  ensureDir,
  nowIso,
  readJson,
  writeJson,
} from "./utils";
import { JobMetadata, JobProgress, JobStatus, JobKind } from "./types";

const jobCache = new Map<string, JobMetadata>();

async function jobFilePath(jobId: string): Promise<string> {
  await ensureDir(config.paths.jobsDir);
  return path.join(config.paths.jobsDir, `${jobId}.json`);
}

async function persistJob(metadata: JobMetadata): Promise<void> {
  const filePath = await jobFilePath(metadata.id);
  await writeJson(filePath, metadata);
  jobCache.set(metadata.id, metadata);
}

async function loadJob(jobId: string): Promise<JobMetadata | null> {
  if (jobCache.has(jobId)) {
    return jobCache.get(jobId)!;
  }
  const filePath = await jobFilePath(jobId);
  const payload = await readJson<JobMetadata>(filePath);
  if (payload) {
    jobCache.set(jobId, payload);
  }
  return payload ?? null;
}

export async function createJob(
  kind: JobKind,
  params: Record<string, unknown>
): Promise<JobMetadata> {
  const jobId = randomUUID();
  const now = nowIso();
  const metadata: JobMetadata = {
    id: jobId,
    kind,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    errors: [],
    progress: {},
    artifacts: {},
    params,
  };
  await persistJob(metadata);
  return metadata;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra: Partial<JobMetadata> = {}
): Promise<JobMetadata | null> {
  const metadata = await loadJob(jobId);
  if (!metadata) {
    return null;
  }
  const now = nowIso();
  const updated: JobMetadata = {
    ...metadata,
    status,
    updatedAt: now,
    startedAt: metadata.startedAt ?? (status === "running" ? now : undefined),
    finishedAt:
      status === "completed" || status === "failed" || status === "cancelled"
        ? now
        : metadata.finishedAt,
    ...extra,
  };
  await persistJob(updated);
  return updated;
}

export async function updateJobProgress(
  jobId: string,
  progress: JobProgress
): Promise<JobMetadata | null> {
  const metadata = await loadJob(jobId);
  if (!metadata) {
    return null;
  }
  const updated: JobMetadata = {
    ...metadata,
    progress: {
      ...metadata.progress,
      ...progress,
    },
    updatedAt: nowIso(),
  };
  await persistJob(updated);
  return updated;
}

export async function addJobError(
  jobId: string,
  message: string,
  error?: unknown
): Promise<JobMetadata | null> {
  const metadata = await loadJob(jobId);
  if (!metadata) {
    return null;
  }
  const stack =
    error instanceof Error
      ? error.stack
      : typeof error === "string"
      ? error
      : undefined;
  const updated: JobMetadata = {
    ...metadata,
    errors: [
      ...metadata.errors,
      {
        timestamp: nowIso(),
        message,
        stack,
      },
    ],
    updatedAt: nowIso(),
  };
  await persistJob(updated);
  return updated;
}

export async function attachArtifact(
  jobId: string,
  key: string,
  value: string
): Promise<JobMetadata | null> {
  const metadata = await loadJob(jobId);
  if (!metadata) {
    return null;
  }
  const updated: JobMetadata = {
    ...metadata,
    artifacts: {
      ...metadata.artifacts,
      [key]: value,
    },
    updatedAt: nowIso(),
  };
  await persistJob(updated);
  return updated;
}

export async function getJob(jobId: string): Promise<JobMetadata | null> {
  return loadJob(jobId);
}

export async function listJobs(): Promise<JobMetadata[]> {
  return Array.from(jobCache.values());
}

export async function loadExistingJobs(): Promise<void> {
  await ensureDir(config.paths.jobsDir);
}


