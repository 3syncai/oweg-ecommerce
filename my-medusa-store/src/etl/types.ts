export type JobKind = "discover" | "backup" | "migrate" | "report";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobProgress {
  total?: number;
  processed?: number;
  succeeded?: number;
  failed?: number;
  percentage?: number;
  message?: string;
  stage?: string;
}

export interface JobMetadata {
  id: string;
  kind: JobKind;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errors: Array<{ timestamp: string; message: string; stack?: string }>;
  progress: JobProgress;
  artifacts: Record<string, string>;
  params: Record<string, unknown>;
}

export interface DiscoverResultTable {
  name: string;
  schema: string;
  engine?: string;
  rows?: number;
  comment?: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    key?: string | null;
    default?: string | null;
    extra?: string | null;
  }>;
  candidateScore: number;
  tags: string[];
}

export interface DiscoverResponse {
  tables: DiscoverResultTable[];
  candidates: string[];
}

export interface ExportJobParams {
  tables: string[];
  includeSchema?: boolean;
  compress?: boolean;
}

export interface MigrateJobParams {
  mappingPath?: string;
  mappingJobId?: string;
  resumeFromCheckpoint?: boolean;
  dryRun?: boolean;
  batchSize?: number;
  maxProducts?: number;
}

export interface ReportJobParams {
  jobId: string;
  format?: "json" | "csv";
}
