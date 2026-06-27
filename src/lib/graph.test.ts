import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/model";
import { buildGraph } from "@/lib/graph";
import { layout, LAYOUTS } from "@/lib/layout";
import type { CfnTemplate } from "@/types/cdk";

const model = buildModel({
  templates: new Map<string, CfnTemplate>([
    [
      "S.template.json",
      {
        Resources: {
          Role: { Type: "AWS::IAM::Role", Properties: {} },
          Table: { Type: "AWS::DynamoDB::Table", Properties: {} },
          Handler: {
            Type: "AWS::Lambda::Function",
            Properties: {
              Role: { "Fn::GetAtt": ["Role", "Arn"] },
              Env: { Ref: "Table" },
            },
          },
        },
      },
    ],
  ]),
});

describe("buildGraph", () => {
  const stack = model.index.get("S")!;
  const graph = buildGraph(stack);

  it("creates a node per child of the focus", () => {
    expect(graph.nodes.map((n) => n.node.name).sort()).toEqual([
      "Handler",
      "Role",
      "Table",
    ]);
  });

  it("creates aggregated edges from references", () => {
    const fromHandler = graph.edges.filter((e) => e.from === "S/Handler");
    expect(fromHandler.map((e) => e.to).sort()).toEqual(["S/Role", "S/Table"]);
  });
});

describe("layout algorithms", () => {
  const stack = model.index.get("S")!;
  const graph = buildGraph(stack);
  const input = { ids: graph.nodes.map((n) => n.id), edges: graph.edges };

  for (const { name } of LAYOUTS) {
    it(`${name} positions every node with finite coordinates`, () => {
      const pos = layout(name, input);
      expect(pos.size).toBe(graph.nodes.length);
      for (const p of pos.values()) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    });
  }

  it("force layout is deterministic for a fixed seed", () => {
    const a = layout("force", input, 7);
    const b = layout("force", input, 7);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});
