export type LogEventCategory = "app";
export type LogEventLevel = "info" | "warn" | "error";

export interface LogsAppendedPayload {
  readonly category: LogEventCategory;
  readonly level: LogEventLevel;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}
