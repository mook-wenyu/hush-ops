import type { BridgeState } from "../types/orchestrator";
import { cardClasses } from "../utils/classNames";

const LABELS: Record<BridgeState, string> = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "已断开",
  reconnecting: "重新连接中"
};

interface BridgeStatusProps {
  state: BridgeState;
  onReconnect: () => void;
  reconnectDisabled?: boolean;
}

export function BridgeStatus({ state, onReconnect, reconnectDisabled }: BridgeStatusProps) {
  return (
    <div className={cardClasses()}>
      <div className="card-body space-y-4">
        <h2 className="card-title text-lg">桥接状态</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`badge badge-lg ${stateBadgeClass(state)}`}>{LABELS[state]}</span>
          <button
            className="btn btn-outline btn-xs"
            type="button"
            onClick={onReconnect}
            disabled={state === "connecting" || reconnectDisabled}
          >
            手动重连
          </button>
        </div>
        <p className="text-sm text-base-content/70">
          {state !== "connected"
            ? "GUI 在断开时仅提供只读信息，等待连接恢复后方可操作。"
            : "桥接已激活，MCP 工具和审批操作处于可用状态。"}
        </p>
      </div>
    </div>
  );
}

function stateBadgeClass(state: BridgeState): string {
  switch (state) {
    case "connected":
      return "badge-success";
    case "connecting":
      return "badge-warning";
    case "reconnecting":
      return "badge-info";
    case "disconnected":
    default:
      return "badge-error";
  }
}
