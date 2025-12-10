"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReport = generateReport;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const plainjs_1 = require("@json2csv/plainjs");
const config_1 = require("./config");
const utils_1 = require("./utils");
const job_manager_1 = require("./job-manager");
async function generateReport(jobId, format) {
    const jobsDir = path_1.default.join(config_1.config.paths.jobsDir);
    const jobFile = path_1.default.join(jobsDir, `${jobId}.json`);
    const job = await (0, utils_1.readJson)(jobFile);
    if (!job) {
        throw new Error(`Job ${jobId} not found for report generation.`);
    }
    const checkpointFile = path_1.default.join(config_1.config.paths.checkpointsDir, jobId, "checkpoint.json");
    const checkpoint = await (0, utils_1.readJson)(checkpointFile);
    const data = {
        summary: checkpoint ?? {},
        errors: job.errors ?? [],
        checkpoints: checkpoint,
    };
    const reportDir = path_1.default.join(config_1.config.paths.reportsDir, jobId);
    await (0, utils_1.ensureDir)(reportDir);
    if (format === "json") {
        const filePath = path_1.default.join(reportDir, "report.json");
        await (0, utils_1.writeJson)(filePath, data);
        await (0, job_manager_1.attachArtifact)(jobId, "report_json", filePath);
        return filePath;
    }
    const parser = new plainjs_1.Parser();
    const csv = parser.parse((data.errors ?? []).map((error) => ({
        timestamp: error.timestamp,
        message: error.message,
        stack: error.stack,
    })));
    const filePath = path_1.default.join(reportDir, "report.csv");
    await promises_1.default.writeFile(filePath, csv, "utf8");
    await (0, job_manager_1.attachArtifact)(jobId, "report_csv", filePath);
    return filePath;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9yZXBvcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFtQkEsd0NBOENDO0FBakVELDJEQUE2QjtBQUM3QixnREFBd0I7QUFDeEIsK0NBQTJDO0FBQzNDLHFDQUFrQztBQUNsQyxtQ0FBeUQ7QUFDekQsK0NBQStDO0FBY3hDLEtBQUssVUFBVSxjQUFjLENBQ2xDLEtBQWEsRUFDYixNQUFzQjtJQUV0QixNQUFNLE9BQU8sR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEQsTUFBTSxPQUFPLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0lBQ3BELE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBQSxnQkFBUSxFQUFNLE9BQU8sQ0FBQyxDQUFDO0lBQ3pDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNULE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLG1DQUFtQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELE1BQU0sY0FBYyxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQzlCLGVBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUMzQixLQUFLLEVBQ0wsaUJBQWlCLENBQ2xCLENBQUM7SUFDRixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUEsZ0JBQVEsRUFBTSxjQUFjLENBQUMsQ0FBQztJQUV2RCxNQUFNLElBQUksR0FBZTtRQUN2QixPQUFPLEVBQUUsVUFBVSxJQUFJLEVBQUU7UUFDekIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLElBQUksRUFBRTtRQUN4QixXQUFXLEVBQUUsVUFBVTtLQUN4QixDQUFDO0lBRUYsTUFBTSxTQUFTLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxlQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM1RCxNQUFNLElBQUEsaUJBQVMsRUFBQyxTQUFTLENBQUMsQ0FBQztJQUUzQixJQUFJLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztRQUN0QixNQUFNLFFBQVEsR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNyRCxNQUFNLElBQUEsaUJBQVMsRUFBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEMsTUFBTSxJQUFBLDRCQUFjLEVBQUMsS0FBSyxFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNyRCxPQUFPLFFBQVEsQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBTSxFQUFFLENBQUM7SUFDNUIsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FDdEIsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsQyxTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVM7UUFDMUIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO1FBQ3RCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztLQUNuQixDQUFDLENBQUMsQ0FDSixDQUFDO0lBQ0YsTUFBTSxRQUFRLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDcEQsTUFBTSxrQkFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzFDLE1BQU0sSUFBQSw0QkFBYyxFQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDcEQsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQyJ9