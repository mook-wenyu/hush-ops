import { describe, it, expect } from "vitest";
import { updatePlanInputWithNodePositions } from "../../../src/ui/utils/planTransforms";

describe("planTransforms · updatePlanInputWithNodePositions", () => {
  it("位置未变时返回相同字符串（避免无意义写回）", () => {
    const plan = {
      id: "p1",
      nodes: [
        { id: "n1", ui: { position: { x: 10, y: 20 } } },
        { id: "n2", ui: { position: { x: 30, y: 40 } } }
      ]
    };
    const input = JSON.stringify(plan, null, 2);
    const next = updatePlanInputWithNodePositions(input, [
      { id: "n1", position: { x: 10, y: 20 } },
      { id: "n2", position: { x: 30, y: 40 } },
    ]);
    expect(next).toBe(input);
  });

  it("位置改变时返回不同字符串", () => {
    const plan = {
      id: "p1",
      nodes: [
        { id: "n1", ui: { position: { x: 10, y: 20 } } },
        { id: "n2", ui: { position: { x: 30, y: 40 } } }
      ]
    };
    const input = JSON.stringify(plan, null, 2);
    const next = updatePlanInputWithNodePositions(input, [
      { id: "n1", position: { x: 11, y: 20 } },
    ]);
    expect(next).not.toBe(input);
  });
});