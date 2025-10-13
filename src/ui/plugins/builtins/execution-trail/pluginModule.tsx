import type { PluginRuntime } from "../../runtime";
import type {
  ExecutionVisualizationStatus,
  PlanNodeEvent,
  PlanNodeOverlayRenderContext
} from "../../../visualizationTypes";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

const EVENT_LABELS: Record<PlanNodeEvent["type"], string> = {
  entered: "进入执行",
  completed: "执行完成",
  "approval:queued": "待审批",
  "approval:resolved": "审批完成"
};

function describeState(state: PlanNodeOverlayRenderContext["nodeState"], status?: ExecutionVisualizationStatus): string {
  if (state === "active") {
    return status === "running" ? "执行中" : "激活";
  }
  if (state === "completed") {
    return "已完成";
  }
  return "就绪";
}

function formatEvent(event: PlanNodeEvent | undefined, fallbackState: PlanNodeOverlayRenderContext["nodeState"], status?: ExecutionVisualizationStatus) {
  if (!event) {
    return {
      label: describeState(fallbackState, status),
      time: ""
    };
  }
  const label = EVENT_LABELS[event.type] ?? "事件";
  const time = timeFormatter.format(new Date(event.timestamp));
  return { label, time };
}

export async function register(runtime: PluginRuntime): Promise<void> {
  runtime.registerOverlay({
    id: "core:execution-trail",
    label: "节点事件轨迹",
    priority: 100,
    shouldRender: (context) => context.events.length > 0 || context.nodeState !== "default",
    render: (context) => {
      const latestEvent = context.events[context.events.length - 1];
      const { label, time } = formatEvent(latestEvent, context.nodeState, context.executionStatus);
      return (
        <div className="plan-node-overlay-badge" data-overlay-id="core:execution-trail">
          <span className="plan-node-overlay-label">{label}</span>
          {time ? <time className="plan-node-overlay-time">{time}</time> : null}
        </div>
      );
    }
  });
  runtime.logger.info("已加载核心执行轨迹插件", { id: "core:execution-trail" });
}
