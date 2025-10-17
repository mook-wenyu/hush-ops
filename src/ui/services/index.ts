// 公共 API 门面（受控命名导出）。
// 过渡期：从 orchestratorApi.ts 导出其余领域 API，
// 新增的分域模块在此集中导出，逐步替换页面导入来源。

// 分域：Tool Streams
export {
  buildToolStreamExportUrl,
  buildGlobalToolStreamExportUrl,
  fetchExecutionToolStreamSummaries,
  fetchGlobalToolStreamSummaries,
  fetchExecutionToolStreamChunks,
  fetchGlobalToolStreamChunks,
  replayExecutionToolStream
} from "./tool-streams.js";

// 分域：Executions
export { fetchExecutions, fetchExecutionById, stopExecution } from "./executions.js";

// 基础：HTTP 工具（按需暴露）
export { getBaseUrl, requestJson, HTTPError, TimeoutError, AbortRequestError } from "./core/http.js";

// 新分域：Plans / Designer / Approvals / MCP / FS / Schedules / Realtime
export { fetchPlans, fetchPlanById, createPlan, updatePlan, deletePlan, uploadPlanFiles, fetchExamplePlans, importExamplePlan, dryRunPlan, executePlan, executePlanById } from "./plans.js";
export { compileGraph, simulateDryRun } from "./designer.js";
export { requestApproval, submitApprovalDecision } from "./approvals.js";
export { fetchMcpServers, fetchMcpTools, callMcpTool } from "./mcp.js";
export type { McpServerSummary } from "./mcp.js";
export { fsList, fsRead, fsWrite, fsMkdir, fsMove, fsDelete } from "./fs.js";
export { fetchSchedules, reloadSchedules } from "./schedules.js";
export type { ScheduleItem } from "./schedules.js";
export { createWebSocket } from "./realtime.js";

// 兼容层（过渡期）：仍保留 orchestratorApi.ts 以避免存量页面大改；
// 若需访问尚未迁出的函数，请从 `./orchestratorApi` 明确导入（不再透过公共门面）。
