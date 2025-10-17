/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PendingApprovals } from "../../src/ui/components/PendingApprovals";
import type { PendingApprovalEntry } from "../../src/ui/types/orchestrator";
import { appStore, setAppStoreEnabledForTests } from "../../src/ui/state/appStore";

expect.extend(matchers);

beforeEach(() => {
  setAppStoreEnabledForTests(false);
  appStore.getState().resetApprovals();
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
  appStore.getState().resetApprovals();
  setAppStoreEnabledForTests(false);
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

  it("store 模式下默认使用 selector 数据与草稿", () => {
    setAppStoreEnabledForTests(true);
    const store = appStore.getState();
    store.upsertPendingApprovals(mockEntries);
    store.setApprovalCommentDraft("approval-1", "store-comment");
    store.setApprovalProcessing("approval-1", true);

    render(
      <PendingApprovals
        disabled={false}
        onCommentChange={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onFocusNode={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("store-comment")).toBeDisabled();
    const processingButtons = screen.getAllByRole("button", { name: "处理中…" });
    expect(processingButtons).toHaveLength(2);
    processingButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });
});
