"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.log = log;
const utils_1 = require("./utils");
const config_1 = require("./config");
const consoleLevelPriority = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};
const configuredLevel = process.env.OPENCART_ETL_LOG_LEVEL ?? "info";
const shouldLogToConsole = (level) => consoleLevelPriority[level] <= consoleLevelPriority[configuredLevel];
async function log(level, payload) {
    const entry = { level, ...payload };
    if (shouldLogToConsole(level)) {
        const { message, ...rest } = entry;
        // eslint-disable-next-line no-console
        console.log(`[${level.toUpperCase()}] ${message}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""}`);
    }
    await (0, utils_1.appendLog)(`${config_1.config.paths.dataDir}/opencart-etl.log`, entry);
}
exports.logger = {
    info: (payload) => log("info", payload),
    warn: (payload) => log("warn", payload),
    error: (payload) => log("error", payload),
    debug: (payload) => log("debug", payload),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL2V0bC9sb2dnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBMEJBLGtCQWVDO0FBekNELG1DQUFvQztBQUNwQyxxQ0FBa0M7QUFZbEMsTUFBTSxvQkFBb0IsR0FBNkI7SUFDckQsS0FBSyxFQUFFLENBQUM7SUFDUixJQUFJLEVBQUUsQ0FBQztJQUNQLElBQUksRUFBRSxDQUFDO0lBQ1AsS0FBSyxFQUFFLENBQUM7Q0FDVCxDQUFDO0FBRUYsTUFBTSxlQUFlLEdBQ2xCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQW1DLElBQUksTUFBTSxDQUFDO0FBRTdELE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFlLEVBQUUsRUFBRSxDQUM3QyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUVoRSxLQUFLLFVBQVUsR0FBRyxDQUFDLEtBQWUsRUFBRSxPQUFtQjtJQUM1RCxNQUFNLEtBQUssR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLE9BQU8sRUFBRSxDQUFDO0lBQ3BDLElBQUksa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUM5QixNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBQ25DLHNDQUFzQztRQUN0QyxPQUFPLENBQUMsR0FBRyxDQUNULElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLE9BQU8sR0FDakMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUMxRCxFQUFFLENBQ0gsQ0FBQztJQUNKLENBQUM7SUFDRCxNQUFNLElBQUEsaUJBQVMsRUFDYixHQUFHLGVBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxtQkFBbUIsRUFDMUMsS0FBZ0MsQ0FDakMsQ0FBQztBQUNKLENBQUM7QUFFWSxRQUFBLE1BQU0sR0FBRztJQUNwQixJQUFJLEVBQUUsQ0FBQyxPQUFtQixFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQztJQUNuRCxJQUFJLEVBQUUsQ0FBQyxPQUFtQixFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQztJQUNuRCxLQUFLLEVBQUUsQ0FBQyxPQUFtQixFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztJQUNyRCxLQUFLLEVBQUUsQ0FBQyxPQUFtQixFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztDQUN0RCxDQUFDIn0=