import { describe, expect, it } from "vitest";

import type { PlanJson } from "../../src/ui/components/graph/PlanCanvas";
import { updatePlanInputWithNodePositions, updatePlanWithNodePositions } from "../../src/ui/utils/planTransforms";

const demoPlan: PlanJson = {
  id: "demo",
  version: "v1",
  entry: "root",
  nodes: [
    { id: "root", type: "sequence", children: ["step"] },
    { id: "step", type: "local_task" }
  ]
};

describe("planTransforms", () => {
  it("applies node position updates to plan object", () => {
    const result = updatePlanWithNodePositions(demoPlan, [
      { id: "root", position: { x: 123.456, y: 78.9 } }
    ]);

    expect(result.nodes?.[0]?.ui?.position).toEqual({ x: 123.46, y: 78.9 });
    expect(result.nodes?.[1]?.ui).toBeUndefined();
  });

  it("returns original string when updates empty", () => {
    const input = JSON.stringify(demoPlan, null, 2);
    const output = updatePlanInputWithNodePositions(input, []);
    expect(output).toBe(input);
  });

  it("updates Plan JSON string with new positions", () => {
    const input = JSON.stringify(demoPlan, null, 2);
    const output = updatePlanInputWithNodePositions(input, [
      { id: "step", position: { x: 10, y: 20 } }
    ]);
    const parsed = JSON.parse(output) as PlanJson;
    expect(parsed.nodes?.[1]?.ui?.position).toEqual({ x: 10, y: 20 });
  });

  it("throws when Plan JSON 无法解析", () => {
    expect(() => updatePlanInputWithNodePositions("not-json", [{ id: "n1", position: { x: 0, y: 0 } }])).toThrow(/Plan JSON 解析失败/);
  });
});
