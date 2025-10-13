/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BridgeStatus } from "../../src/ui/components/BridgeStatus";

expect.extend(matchers);
afterEach(cleanup);

describe("BridgeStatus", () => {
  it("renders current bridge state label", () => {
    render(<BridgeStatus state="connected" onReconnect={vi.fn()} />);
    expect(screen.getByText(/已连接/)).toBeInTheDocument();
  });

  it("disables reconnect button when connecting", () => {
    render(<BridgeStatus state="connecting" onReconnect={vi.fn()} />);
    const button = screen.getByRole("button", { name: /手动重连/ });
    expect(button).toBeDisabled();
  });

  it("calls callback when reconnecting", () => {
    const handler = vi.fn();
    render(<BridgeStatus state="disconnected" onReconnect={handler} />);
    const button = screen.getByRole("button", { name: /手动重连/ });
    fireEvent.click(button);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
