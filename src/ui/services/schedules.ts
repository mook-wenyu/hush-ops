import { fetchExecutionHistory } from "./executions.js";
import { fetchPlans } from "./plans.js";
import { requestJson } from "./core/http.js";

export interface ScheduleItem {
  planId: string;
  nextRunISO?: string;
  lastRun?: {
    status: string;
    finishedAt?: string;
  };
}

export async function fetchSchedules(): Promise<ScheduleItem[]> {
  try {
    // 快速探测后端健康；失败则直接返回空列表以避免洪泛请求
    try {
      await requestJson("GET", "/status", { timeoutMs: 1200 });
    } catch {
      return [];
    }

    // 获取所有计划
    const plans = await fetchPlans();

    // 为每个计划获取最近的执行历史
    const scheduleItems: ScheduleItem[] = [];

    for (const plan of plans) {
      try {
        const history = await fetchExecutionHistory({ planId: plan.id, limit: 1 });
        const lastExecution = history.executions[0];

        const item: ScheduleItem = { planId: plan.id };
        if (lastExecution) {
          item.lastRun = { status: lastExecution.status };
          if (lastExecution.finishedAt) {
            item.lastRun.finishedAt = lastExecution.finishedAt;
          }
        }
        scheduleItems.push(item);
      } catch {
        // 如果获取执行历史失败，只添加 planId
        scheduleItems.push({ planId: plan.id });
      }
    }

    return scheduleItems;
  } catch {
    return [];
  }
}
