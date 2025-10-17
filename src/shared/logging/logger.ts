import { join } from "node:path";

import pino, { type Logger, type LoggerOptions } from "pino";

import type { LogEventCategory, LogsAppendedPayload } from "./events.js";
import { getHushOpsLogsDirectory } from "../environment/pathResolver.js";

export const LOG_ROOT = getHushOpsLogsDirectory();

const LOG_FILE = "app.jsonl";

const destination = pino.destination({
  dest: join(LOG_ROOT, LOG_FILE),
  mkdir: true,
  sync: false
});

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime
};

const baseLogger = pino(baseOptions, destination);

let logEventPublisher: ((payload: LogsAppendedPayload) => void) | null = null;

export function setLogEventPublisher(publisher: ((payload: LogsAppendedPayload) => void) | null) {
  logEventPublisher = publisher;
}

export interface LoggerContext {
  planId?: string;
  nodeId?: string;
  nodeType?: string;
  stream?: LogEventCategory;
  [key: string]: unknown;
}

export function createLogger(category: string, context: LoggerContext = {}): Logger {
  const { stream: _stream, ...rest } = context;
  return baseLogger.child({ category, ...rest });
}

export function getBaseLogger(): Logger {
  return baseLogger;
}

export interface LoggerFacade {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
}

export function createLoggerFacade(
  category: string,
  context: LoggerContext = {}
): LoggerFacade {
  const { stream, ...restContext } = context;
  const logger = createLogger(category, context);
  const baseContext = { ...restContext, category } as Record<string, unknown>;
  const resolvedCategory = resolveLogCategory(category, stream);

  const emitLogEvent = (level: "info" | "warn" | "error", message: string, extra: Record<string, unknown>) => {
    if (!logEventPublisher) {
      return;
    }
    const mergedContext = Object.keys(extra).length > 0 ? { ...baseContext, ...extra } : baseContext;
    const payload: LogsAppendedPayload = {
      category: resolvedCategory,
      level,
      message,
      context: Object.keys(mergedContext).length > 0 ? mergedContext : undefined
    };
    logEventPublisher(payload);
  };

  return {
    info(message, extra = {}) {
      logger.info(extra, message);
      emitLogEvent("info", message, extra);
    },
    warn(message, extra = {}) {
      logger.warn(extra, message);
      emitLogEvent("warn", message, extra);
    },
    error(message, error, extra = {}) {
      let errorContext = extra;
      if (error instanceof Error) {
        errorContext = {
          ...extra,
          error: { name: error.name, message: error.message, stack: error.stack }
        };
        logger.error(errorContext, message);
      } else if (error) {
        errorContext = { ...extra, error };
        logger.error(errorContext, message);
      } else {
        logger.error(extra, message);
      }
      emitLogEvent("error", message, errorContext);
    }
  };
}

function resolveLogCategory(category: string, explicit?: LogEventCategory): LogEventCategory {
  if (explicit) {
    return explicit;
  }
  if (isLogCategory(category)) {
    return category as LogEventCategory;
  }
  return "app";
}

function isLogCategory(value: string): value is LogEventCategory {
  return value === "app";
}
