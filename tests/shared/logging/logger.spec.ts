import { afterEach, describe, expect, it } from "vitest";

import { createLoggerFacade, setLogEventPublisher } from "../../../src/shared/logging/logger.js";

interface CapturedLog {
  category: string;
  level: string;
  message: string;
}

describe("logging facade", () => {
  const captured: CapturedLog[] = [];

  afterEach(() => {
    captured.length = 0;
    setLogEventPublisher(null);
  });

  it("uses app category for built-in namespaces", () => {
    setLogEventPublisher((payload) => {
      captured.push({ category: payload.category, level: payload.level, message: payload.message });
    });
    const executorLogger = createLoggerFacade("executor");
    executorLogger.info("hello");
    expect(captured.at(-1)?.category).toBe("app");

    const bridgeLogger = createLoggerFacade("bridge-client");
    bridgeLogger.warn("bridge");
    expect(captured.at(-1)?.category).toBe("app");
  });

  it("allows explicit stream override", () => {
    setLogEventPublisher((payload) => {
      captured.push({ category: payload.category, level: payload.level, message: payload.message });
    });
    const facade = createLoggerFacade("custom-category", { stream: "app" });
    facade.info("override");
    expect(captured.at(-1)?.category).toBe("app");
  });

  it("falls back to app for unknown categories", () => {
    setLogEventPublisher((payload) => {
      captured.push({ category: payload.category, level: payload.level, message: payload.message });
    });
    const facade = createLoggerFacade("unknown-category");
    facade.error("unknown");
    expect(captured.at(-1)?.category).toBe("app");
  });
});
