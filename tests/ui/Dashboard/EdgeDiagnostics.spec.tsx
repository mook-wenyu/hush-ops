import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PlanCanvas, type PlanJson } from "../../../src/ui/components/graph/PlanCanvas";

function buildPlan(): PlanJson {
  return {
    id: "p1",
    entry: "A",
    nodes: [
      { id: "A", children: ["B"], label: "节点A" },
      { id: "B", label: "节点B" }
    ]
  };
}

// Note: ReactFlow renders SVG edges; we assert by detecting an edge path with the error color stroke.
// This is a lightweight sanity check that our edge-level diagnostics mapping is applied.

describe.skip("PlanCanvas edge diagnostics", () => {
  it("colors edge with error diagnostics in red", async () => {
    const plan = buildPlan();
    render(
      <PlanCanvas
        plan={plan}
        bridgeState={"connected" as any}
        pendingNodeIds={new Set()}
        currentNodeId={null}
        completedNodeIds={new Set()}
        executionStatus={"idle" as any}
        selectedNodeId={null}
        editable={false}
        onlyRenderVisibleElements={true}
        diagnostics={[{ severity: "error", message: "bad edge", edgeId: "A->B" }]}
      />
    );

    // ReactFlow edges use path elements; our styling sets stroke to #ef4444 for error
    // Give jsdom a tiny tick to mount ReactFlow
    await new Promise((r) => setTimeout(r, 50));

    const redEdge = document.querySelector('path[stroke="#ef4444"]');
    expect(redEdge).toBeTruthy();
  });
});
