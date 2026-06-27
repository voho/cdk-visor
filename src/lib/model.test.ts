import { describe, expect, it } from "vitest";
import { buildModel, ancestry, parseTraceFrame, type RawArtifacts } from "@/lib/model";
import type { CfnTemplate } from "@/types/cdk";

function treeAssembly(): RawArtifacts {
  return {
    tree: {
      version: "tree-0.1",
      tree: {
        id: "App",
        path: "",
        constructInfo: { fqn: "aws-cdk-lib.App" },
        children: {
          MyStack: {
            id: "MyStack",
            path: "MyStack",
            constructInfo: { fqn: "aws-cdk-lib.Stack" },
            children: {
              Bucket: {
                id: "Bucket",
                path: "MyStack/Bucket",
                constructInfo: { fqn: "aws-cdk-lib.aws_s3.Bucket" },
                children: {
                  Resource: {
                    id: "Resource",
                    path: "MyStack/Bucket/Resource",
                    constructInfo: { fqn: "aws-cdk-lib.aws_s3.CfnBucket" },
                    attributes: {
                      "aws:cdk:cloudformation:type": "AWS::S3::Bucket",
                      "aws:cdk:cloudformation:props": {
                        VersioningConfiguration: { Status: "Enabled" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    manifest: {
      version: "x",
      artifacts: {
        MyStack: {
          type: "aws:cloudformation:stack",
          properties: { templateFile: "MyStack.template.json" },
          metadata: {
            "/MyStack/Bucket/Resource": [
              {
                type: "aws:cdk:logicalId",
                data: "BucketABC123",
                trace: ["    at new MyStack (/asset/src/main.ts:5:7)"],
              },
            ],
          },
        },
      },
    },
    templates: new Map<string, CfnTemplate>([
      [
        "MyStack.template.json",
        {
          Resources: {
            BucketABC123: {
              Type: "AWS::S3::Bucket",
              Properties: {},
              Metadata: { "aws:cdk:path": "MyStack/Bucket/Resource" },
            },
          },
        },
      ],
    ]),
  };
}

describe("buildModel (tree-based)", () => {
  const model = buildModel(treeAssembly());

  it("classifies nodes by their construct fqn", () => {
    expect(model.root.kind).toBe("app");
    expect(model.index.get("MyStack")?.kind).toBe("stack");
    expect(model.index.get("MyStack/Bucket")?.kind).toBe("construct");
    expect(model.index.get("MyStack/Bucket/Resource")?.kind).toBe("resource");
  });

  it("links a resource node to its CloudFormation output and logical id", () => {
    const res = model.index.get("MyStack/Bucket/Resource")!;
    expect(res.cfnType).toBe("AWS::S3::Bucket");
    expect(res.logicalId).toBe("BucketABC123");
    expect(res.resource?.Type).toBe("AWS::S3::Bucket");
    expect(res.stackName).toBe("MyStack");
  });

  it("captures parsed source traces", () => {
    const res = model.index.get("MyStack/Bucket/Resource")!;
    expect(res.traces).toHaveLength(1);
    expect(res.traces[0].file).toBe("/asset/src/main.ts");
    expect(res.traces[0].line).toBe(5);
    expect(res.traces[0].symbol).toBe("new MyStack");
  });

  it("rolls up descendant and resource counts", () => {
    expect(model.root.descendantCount).toBe(3); // Stack + Bucket + Resource
    expect(model.root.resourceCount).toBe(1);
    expect(model.index.get("MyStack/Bucket")?.resourceCount).toBe(1);
  });

  it("exposes stacks and produces no warnings for a full assembly", () => {
    expect(model.stacks.map((s) => s.id)).toEqual(["MyStack"]);
    expect(model.warnings).toHaveLength(0);
  });

  it("ancestry returns the chain from the root to the node", () => {
    const res = model.index.get("MyStack/Bucket/Resource")!;
    expect(ancestry(res).map((n) => n.name)).toEqual([
      "App",
      "MyStack",
      "Bucket",
      "Resource",
    ]);
  });
});

describe("buildModel (template-only fallback)", () => {
  const model = buildModel({
    templates: new Map<string, CfnTemplate>([
      [
        "Stack.template.json",
        { Resources: { Queue: { Type: "AWS::SQS::Queue", Properties: {} } } },
      ],
    ]),
  });

  it("reconstructs a tree from templates and warns", () => {
    expect(model.root.kind).toBe("app");
    expect(model.index.get("Stack")?.kind).toBe("stack");
    const res = model.index.get("Stack/Queue")!;
    expect(res.kind).toBe("resource");
    expect(res.cfnType).toBe("AWS::SQS::Queue");
    expect(model.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseTraceFrame", () => {
  it("parses symbol + location frames", () => {
    const f = parseTraceFrame("    at new Foo (/a/b.ts:12:34)");
    expect(f).toMatchObject({ symbol: "new Foo", file: "/a/b.ts", line: 12, column: 34 });
  });

  it("parses bare location frames", () => {
    const f = parseTraceFrame("/a/b.ts:7:1");
    expect(f).toMatchObject({ file: "/a/b.ts", line: 7, column: 1 });
    expect(f.symbol).toBeUndefined();
  });
});
