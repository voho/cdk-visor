import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/model";
import type { AssemblyManifest, CfnTemplate, TreeManifest } from "@/types/cdk";

const read = (file: string) =>
  JSON.parse(readFileSync(new URL(`../../public/demo/${file}`, import.meta.url), "utf8"));

const tree = read("tree.json") as TreeManifest;
const manifest = read("manifest.json") as AssemblyManifest;
const templates = new Map<string, CfnTemplate>();
for (const artifact of Object.values(manifest.artifacts ?? {})) {
  const file = artifact.properties?.templateFile;
  if (file && artifact.type === "aws:cloudformation:stack") {
    templates.set(file, read(file) as CfnTemplate);
  }
}

const model = buildModel({ tree, manifest, templates });

describe("bundled demo assembly", () => {
  it("loads cleanly with no warnings", () => {
    expect(model.warnings).toHaveLength(0);
    expect(model.stacks.map((s) => s.id).sort()).toEqual(["ApiStack", "NetworkStack"]);
  });

  it("contains the expected number of resources", () => {
    expect(model.root.resourceCount).toBe(16);
  });

  it("links every resource to a CloudFormation resource and logical id", () => {
    const resources = model.all.filter((n) => n.kind === "resource");
    expect(resources.length).toBe(16);
    for (const r of resources) {
      expect(r.resource, r.path).toBeDefined();
      expect(r.logicalId, r.path).toBeTruthy();
    }
  });

  it("resolves references between the Lambda and its dependencies", () => {
    const handler = model.index.get("ApiStack/OrderHandler/Resource")!;
    const targets = handler.referencesOut.map((r) => r.node?.path);
    expect(targets).toContain("ApiStack/OrdersTable/Resource");
    expect(targets).toContain("ApiStack/AssetsBucket/Resource");
    expect(targets).toContain("ApiStack/OrderHandler/ServiceRole/Resource");
  });

  it("captures source traces resolvable to demo source files", () => {
    const handler = model.index.get("ApiStack/OrderHandler/Resource")!;
    const userFrame = handler.traces.find((f) => f.file?.includes("api-stack.ts"));
    expect(userFrame?.line).toBeGreaterThan(0);
  });
});
