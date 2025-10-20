import type { AddressInfo } from "node:net";

import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createOrchestratorService } from "../../../src/service/orchestrator/server.js";
import { OrchestratorClient } from "../../../src/client/orchestrator.js";
import type { LogsAppendedPayload } from "../../../src/shared/logging/events.js";

const LOG_EVENT: LogsAppendedPayload = {
  category: "app",
  level: "info",
  message: "test log",
  context: { key: "value" }
};

describe("orchestrator events skeleton", () => {
  let baseUrl: string;
  let publishLogEvent: ((payload: LogsAppendedPayload) => void) | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const { app, publishLogEvent: logEmitter } = await createOrchestratorService({
      controllerOptions: { defaultUseMockBridge: true }
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    publishLogEvent = logEmitter;
    closeServer = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  test("broadcasts logs.appended skeleton event", async () => {
    const client = new OrchestratorClient({ baseUrl, fetchImpl: fetch, WebSocketImpl: WebSocket });
    const stream = client.connectEvents({ topics: ["logs"] });
    const received: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 3000);
      stream.emitter.on("service.connected", () => {
        publishLogEvent?.(LOG_EVENT);
      });
      stream.emitter.on("logs.appended", (payload) => {
        clearTimeout(timeout);
        received.push(payload);
        resolve();
      });
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject(LOG_EVENT);
    stream.close();
  });
});
