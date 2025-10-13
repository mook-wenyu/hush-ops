/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PendingApprovals } from "../../src/ui/components/PendingApprovals";
import type { PendingApprovalEntry } from "../../src/ui/types/orchestrator";

expect.extend(matchers);

afterEach(() => {
  vi.clearAllMocks();
});

describe("PendingApprovals", () => {
  const mockEntries: PendingApprovalEntry[] = [
    {
      id: "approval-1",
      planId: "demo",
      nodeId: "step-1",
      nodeType: "local_task",
      riskLevel: "high",
      requiresApproval: true,
      requestedAt: new Date().toISOString(),
      requestedBy: "tester",
      comment: null
    }
  ];

  it("calls onFocusNode when 定位节点 被点击", async () => {
    const onFocusNode = vi.fn();
    render(
      <PendingApprovals
        entries={mockEntries}
        disabled={false}
        commentMap={{}}
        onCommentChange={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        processingId={null}
        onFocusNode={onFocusNode}
      />
    );

    const focusButton = screen.getByRole("button", { name: "定位节点" });
    fireEvent.click(focusButton);
    expect(onFocusNode).toHaveBeenCalledWith("step-1");
  });
});
