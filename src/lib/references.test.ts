import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/model";
import type { CfnTemplate } from "@/types/cdk";

// Build references through the template-only path, which exercises the same
// buildReferences() pass without needing a tree/manifest.
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
              Environment: { Variables: { TABLE: { Ref: "Table" }, REGION: { Ref: "AWS::Region" } } },
              Description: { "Fn::Sub": "handler-for-${Table}" },
              Bus: { "Fn::ImportValue": "SharedEventBus" },
            },
            DependsOn: ["Role"],
          },
        },
      },
    ],
  ]),
});

const handler = model.index.get("S/Handler")!;
const role = model.index.get("S/Role")!;
const table = model.index.get("S/Table")!;

describe("buildReferences", () => {
  it("resolves Fn::GetAtt with its attribute", () => {
    expect(
      handler.referencesOut.find((r) => r.kind === "GetAtt" && r.node === role)
        ?.attribute,
    ).toBe("Arn");
  });

  it("resolves Ref targets and ignores AWS:: pseudo parameters", () => {
    expect(handler.referencesOut.some((r) => r.kind === "Ref" && r.node === table)).toBe(true);
    expect(handler.referencesOut.some((r) => r.name === "AWS::Region")).toBe(false);
  });

  it("resolves references inside Fn::Sub templates", () => {
    expect(handler.referencesOut.some((r) => r.kind === "Sub" && r.node === table)).toBe(true);
  });

  it("records DependsOn edges", () => {
    expect(handler.referencesOut.some((r) => r.kind === "DependsOn" && r.node === role)).toBe(true);
  });

  it("keeps Fn::ImportValue as an external reference", () => {
    const ext = handler.referencesOut.find((r) => r.external);
    expect(ext?.name).toBe("SharedEventBus");
    expect(ext?.node).toBeUndefined();
  });

  it("populates incoming references in both directions", () => {
    // Role is reached via GetAtt and DependsOn.
    expect(role.referencesIn.filter((r) => r.node === handler)).toHaveLength(2);
    // Table is reached via Ref and Sub.
    expect(table.referencesIn.filter((r) => r.node === handler)).toHaveLength(2);
  });
});
