import { describe, it, expect } from "vitest";
import { PlanSchemaV3, migrateChildrenToEdges } from "../../src/shared/schemas/plan.v3.js";

describe("Plan v3 schema", () => {
  it("parses a valid v3 plan with edges", () => {
    const plan = {
      id: "p",
      version: "v3.1.0",
      entry: "A",
      description: "demo",
      nodes: [
        { id: "A", type: "sequence" },
        { id: "B", type: "local_task", driver: "shell", effectScope: "filesystem" }
      ],
      edges: [
        { id: "A->B", source: "A", target: "B" }
      ]
    };
    const parsed = PlanSchemaV3.parse(plan);
    expect(parsed.id).toBe("p");
    expect(parsed.edges).toHaveLength(1);
  });

  it("migrates children to edges and passes schema", () => {
    const legacy = {
      id: "p2",
      entry: "X",
      nodes: [
        { id: "X", type: "sequence", children: ["Y"] },
        { id: "Y", type: "local_task", driver: "shell", effectScope: "network" }
      ]
    } as any;
    const v3 = migrateChildrenToEdges(legacy);
    const parsed = PlanSchemaV3.parse(v3);
    expect(parsed.entry).toBe("X");
    expect(parsed.edges[0]?.source).toBe("X");
  });
});
