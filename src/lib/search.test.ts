import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/model";
import { search } from "@/lib/search";
import type { CfnTemplate } from "@/types/cdk";

const model = buildModel({
  templates: new Map<string, CfnTemplate>([
    [
      "Stack.template.json",
      {
        Resources: {
          AssetsBucket: { Type: "AWS::S3::Bucket", Properties: {} },
          OrdersTable: { Type: "AWS::DynamoDB::Table", Properties: {} },
        },
      },
    ],
  ]),
});

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search(model.all, "")).toEqual([]);
  });

  it("matches on name", () => {
    const hits = search(model.all, "bucket");
    expect(hits[0].node.name).toBe("AssetsBucket");
  });

  it("matches on CloudFormation type", () => {
    const hits = search(model.all, "dynamodb");
    expect(hits.some((h) => h.node.name === "OrdersTable")).toBe(true);
  });

  it("ranks exact name matches above looser ones", () => {
    const hits = search(model.all, "orderstable");
    expect(hits[0].node.name).toBe("OrdersTable");
  });

  it("respects the result limit", () => {
    expect(search(model.all, "a", 1).length).toBeLessThanOrEqual(1);
  });
});
