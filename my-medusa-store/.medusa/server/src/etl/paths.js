"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_FILE = exports.REPORTS_DIR = exports.CHECKPOINTS_DIR = exports.MAPPINGS_DIR = exports.JOBS_DIR = exports.ETL_DIR = exports.LOG_ROOT = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.LOG_ROOT = process.env.ETL_LOG_DIR
    ? path_1.default.resolve(process.env.ETL_LOG_DIR)
    : path_1.default.resolve("C:/oweg-etl-logs"); // Windows-safe fallback
exports.ETL_DIR = path_1.default.join(exports.LOG_ROOT, "opencart-etl");
exports.JOBS_DIR = path_1.default.join(exports.ETL_DIR, "jobs");
exports.MAPPINGS_DIR = path_1.default.join(exports.ETL_DIR, "mappings");
exports.CHECKPOINTS_DIR = path_1.default.join(exports.ETL_DIR, "checkpoints");
exports.REPORTS_DIR = path_1.default.join(exports.ETL_DIR, "reports");
exports.LOG_FILE = path_1.default.join(exports.ETL_DIR, "opencart-etl.log");
// ensure dirs exist
for (const d of [exports.ETL_DIR, exports.JOBS_DIR, exports.MAPPINGS_DIR, exports.CHECKPOINTS_DIR, exports.REPORTS_DIR]) {
    fs_1.default.mkdirSync(d, { recursive: true });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvZXRsL3BhdGhzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLGdEQUF3QjtBQUN4Qiw0Q0FBb0I7QUFFUCxRQUFBLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVc7SUFDN0MsQ0FBQyxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUM7SUFDdkMsQ0FBQyxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjtBQUVqRCxRQUFBLE9BQU8sR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFRLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDOUMsUUFBQSxRQUFRLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxlQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDdEMsUUFBQSxZQUFZLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxlQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDOUMsUUFBQSxlQUFlLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxlQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDcEQsUUFBQSxXQUFXLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxlQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDNUMsUUFBQSxRQUFRLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxlQUFPLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUUvRCxvQkFBb0I7QUFDcEIsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQU8sRUFBRSxnQkFBUSxFQUFFLG9CQUFZLEVBQUUsdUJBQWUsRUFBRSxtQkFBVyxDQUFDLEVBQUUsQ0FBQztJQUNoRixZQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZDLENBQUMifQ==