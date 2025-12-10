"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
exports.updateJobStatus = updateJobStatus;
exports.updateJobProgress = updateJobProgress;
exports.addJobError = addJobError;
exports.attachArtifact = attachArtifact;
exports.getJob = getJob;
exports.listJobs = listJobs;
exports.loadExistingJobs = loadExistingJobs;
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const utils_1 = require("./utils");
const jobCache = new Map();
async function jobFilePath(jobId) {
    await (0, utils_1.ensureDir)(config_1.config.paths.jobsDir);
    return path_1.default.join(config_1.config.paths.jobsDir, `${jobId}.json`);
}
async function persistJob(metadata) {
    const filePath = await jobFilePath(metadata.id);
    await (0, utils_1.writeJson)(filePath, metadata);
    jobCache.set(metadata.id, metadata);
}
async function loadJob(jobId) {
    if (jobCache.has(jobId)) {
        return jobCache.get(jobId);
    }
    const filePath = await jobFilePath(jobId);
    const payload = await (0, utils_1.readJson)(filePath);
    if (payload) {
        jobCache.set(jobId, payload);
    }
    return payload ?? null;
}
async function createJob(kind, params) {
    const jobId = (0, crypto_1.randomUUID)();
    const now = (0, utils_1.nowIso)();
    const metadata = {
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
async function updateJobStatus(jobId, status, extra = {}) {
    const metadata = await loadJob(jobId);
    if (!metadata) {
        return null;
    }
    const now = (0, utils_1.nowIso)();
    const updated = {
        ...metadata,
        status,
        updatedAt: now,
        startedAt: metadata.startedAt ?? (status === "running" ? now : undefined),
        finishedAt: status === "completed" || status === "failed" || status === "cancelled"
            ? now
            : metadata.finishedAt,
        ...extra,
    };
    await persistJob(updated);
    return updated;
}
async function updateJobProgress(jobId, progress) {
    const metadata = await loadJob(jobId);
    if (!metadata) {
        return null;
    }
    const updated = {
        ...metadata,
        progress: {
            ...metadata.progress,
            ...progress,
        },
        updatedAt: (0, utils_1.nowIso)(),
    };
    await persistJob(updated);
    return updated;
}
async function addJobError(jobId, message, error) {
    const metadata = await loadJob(jobId);
    if (!metadata) {
        return null;
    }
    const stack = error instanceof Error
        ? error.stack
        : typeof error === "string"
            ? error
            : undefined;
    const updated = {
        ...metadata,
        errors: [
            ...metadata.errors,
            {
                timestamp: (0, utils_1.nowIso)(),
                message,
                stack,
            },
        ],
        updatedAt: (0, utils_1.nowIso)(),
    };
    await persistJob(updated);
    return updated;
}
async function attachArtifact(jobId, key, value) {
    const metadata = await loadJob(jobId);
    if (!metadata) {
        return null;
    }
    const updated = {
        ...metadata,
        artifacts: {
            ...metadata.artifacts,
            [key]: value,
        },
        updatedAt: (0, utils_1.nowIso)(),
    };
    await persistJob(updated);
    return updated;
}
async function getJob(jobId) {
    return loadJob(jobId);
}
async function listJobs() {
    return Array.from(jobCache.values());
}
async function loadExistingJobs() {
    await (0, utils_1.ensureDir)(config_1.config.paths.jobsDir);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiam9iLW1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZXRsL2pvYi1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBb0NBLDhCQW1CQztBQUVELDBDQXVCQztBQUVELDhDQWtCQztBQUVELGtDQTZCQztBQUVELHdDQW1CQztBQUVELHdCQUVDO0FBRUQsNEJBRUM7QUFFRCw0Q0FFQztBQXBLRCxtQ0FBb0M7QUFDcEMsZ0RBQXdCO0FBQ3hCLHFDQUFrQztBQUNsQyxtQ0FLaUI7QUFHakIsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQXVCLENBQUM7QUFFaEQsS0FBSyxVQUFVLFdBQVcsQ0FBQyxLQUFhO0lBQ3RDLE1BQU0sSUFBQSxpQkFBUyxFQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEMsT0FBTyxjQUFJLENBQUMsSUFBSSxDQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEdBQUcsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUMxRCxDQUFDO0FBRUQsS0FBSyxVQUFVLFVBQVUsQ0FBQyxRQUFxQjtJQUM3QyxNQUFNLFFBQVEsR0FBRyxNQUFNLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDaEQsTUFBTSxJQUFBLGlCQUFTLEVBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3BDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN0QyxDQUFDO0FBRUQsS0FBSyxVQUFVLE9BQU8sQ0FBQyxLQUFhO0lBQ2xDLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3hCLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUUsQ0FBQztJQUM5QixDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUMsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFBLGdCQUFRLEVBQWMsUUFBUSxDQUFDLENBQUM7SUFDdEQsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUNaLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFDRCxPQUFPLE9BQU8sSUFBSSxJQUFJLENBQUM7QUFDekIsQ0FBQztBQUVNLEtBQUssVUFBVSxTQUFTLENBQzdCLElBQWEsRUFDYixNQUErQjtJQUUvQixNQUFNLEtBQUssR0FBRyxJQUFBLG1CQUFVLEdBQUUsQ0FBQztJQUMzQixNQUFNLEdBQUcsR0FBRyxJQUFBLGNBQU0sR0FBRSxDQUFDO0lBQ3JCLE1BQU0sUUFBUSxHQUFnQjtRQUM1QixFQUFFLEVBQUUsS0FBSztRQUNULElBQUk7UUFDSixNQUFNLEVBQUUsUUFBUTtRQUNoQixTQUFTLEVBQUUsR0FBRztRQUNkLFNBQVMsRUFBRSxHQUFHO1FBQ2QsTUFBTSxFQUFFLEVBQUU7UUFDVixRQUFRLEVBQUUsRUFBRTtRQUNaLFNBQVMsRUFBRSxFQUFFO1FBQ2IsTUFBTTtLQUNQLENBQUM7SUFDRixNQUFNLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzQixPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDO0FBRU0sS0FBSyxVQUFVLGVBQWUsQ0FDbkMsS0FBYSxFQUNiLE1BQWlCLEVBQ2pCLFFBQThCLEVBQUU7SUFFaEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxHQUFHLEdBQUcsSUFBQSxjQUFNLEdBQUUsQ0FBQztJQUNyQixNQUFNLE9BQU8sR0FBZ0I7UUFDM0IsR0FBRyxRQUFRO1FBQ1gsTUFBTTtRQUNOLFNBQVMsRUFBRSxHQUFHO1FBQ2QsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUFTLElBQUksQ0FBQyxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUN6RSxVQUFVLEVBQ1IsTUFBTSxLQUFLLFdBQVcsSUFBSSxNQUFNLEtBQUssUUFBUSxJQUFJLE1BQU0sS0FBSyxXQUFXO1lBQ3JFLENBQUMsQ0FBQyxHQUFHO1lBQ0wsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVO1FBQ3pCLEdBQUcsS0FBSztLQUNULENBQUM7SUFDRixNQUFNLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxQixPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDO0FBRU0sS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxLQUFhLEVBQ2IsUUFBcUI7SUFFckIsTUFBTSxRQUFRLEdBQUcsTUFBTSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxPQUFPLEdBQWdCO1FBQzNCLEdBQUcsUUFBUTtRQUNYLFFBQVEsRUFBRTtZQUNSLEdBQUcsUUFBUSxDQUFDLFFBQVE7WUFDcEIsR0FBRyxRQUFRO1NBQ1o7UUFDRCxTQUFTLEVBQUUsSUFBQSxjQUFNLEdBQUU7S0FDcEIsQ0FBQztJQUNGLE1BQU0sVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFCLE9BQU8sT0FBTyxDQUFDO0FBQ2pCLENBQUM7QUFFTSxLQUFLLFVBQVUsV0FBVyxDQUMvQixLQUFhLEVBQ2IsT0FBZSxFQUNmLEtBQWU7SUFFZixNQUFNLFFBQVEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFDRCxNQUFNLEtBQUssR0FDVCxLQUFLLFlBQVksS0FBSztRQUNwQixDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUs7UUFDYixDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUTtZQUMzQixDQUFDLENBQUMsS0FBSztZQUNQLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDaEIsTUFBTSxPQUFPLEdBQWdCO1FBQzNCLEdBQUcsUUFBUTtRQUNYLE1BQU0sRUFBRTtZQUNOLEdBQUcsUUFBUSxDQUFDLE1BQU07WUFDbEI7Z0JBQ0UsU0FBUyxFQUFFLElBQUEsY0FBTSxHQUFFO2dCQUNuQixPQUFPO2dCQUNQLEtBQUs7YUFDTjtTQUNGO1FBQ0QsU0FBUyxFQUFFLElBQUEsY0FBTSxHQUFFO0tBQ3BCLENBQUM7SUFDRixNQUFNLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxQixPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDO0FBRU0sS0FBSyxVQUFVLGNBQWMsQ0FDbEMsS0FBYSxFQUNiLEdBQVcsRUFDWCxLQUFhO0lBRWIsTUFBTSxRQUFRLEdBQUcsTUFBTSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxPQUFPLEdBQWdCO1FBQzNCLEdBQUcsUUFBUTtRQUNYLFNBQVMsRUFBRTtZQUNULEdBQUcsUUFBUSxDQUFDLFNBQVM7WUFDckIsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLO1NBQ2I7UUFDRCxTQUFTLEVBQUUsSUFBQSxjQUFNLEdBQUU7S0FDcEIsQ0FBQztJQUNGLE1BQU0sVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFCLE9BQU8sT0FBTyxDQUFDO0FBQ2pCLENBQUM7QUFFTSxLQUFLLFVBQVUsTUFBTSxDQUFDLEtBQWE7SUFDeEMsT0FBTyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDeEIsQ0FBQztBQUVNLEtBQUssVUFBVSxRQUFRO0lBQzVCLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRU0sS0FBSyxVQUFVLGdCQUFnQjtJQUNwQyxNQUFNLElBQUEsaUJBQVMsRUFBQyxlQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3hDLENBQUMifQ==