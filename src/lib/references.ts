/**
 * Derives the reference graph that ties a CDK app together: which resource
 * depends on, refers to, or reads an attribute of which other resource. Edges
 * are extracted from the CloudFormation intrinsics (`Ref`, `Fn::GetAtt`,
 * `Fn::Sub`, `Fn::ImportValue`) and from `DependsOn`, then resolved to nodes so
 * the inspector can offer click-through navigation in both directions.
 */
import type { CfnResource } from "@/types/cdk";
import type { RefKind, VisorNode } from "@/lib/model";

interface RawEdge {
  to: string;
  kind: RefKind;
  attribute?: string;
  external?: boolean;
}

/**
 * Walk every resource and attach resolved incoming/outgoing references. Targets
 * are resolved within the same stack (logical ids are only unique per stack);
 * `Fn::ImportValue` targets are kept as external references.
 */
export function buildReferences(all: VisorNode[]): void {
  const byStack = new Map<string, Map<string, VisorNode>>();
  for (const node of all) {
    if (!node.logicalId || !node.resource) continue;
    const key = node.stackName ?? "";
    let local = byStack.get(key);
    if (!local) byStack.set(key, (local = new Map()));
    local.set(node.logicalId, node);
  }

  for (const node of all) {
    if (!node.resource || !node.logicalId) continue;
    const local = byStack.get(node.stackName ?? "");
    const seen = new Set<string>();

    for (const edge of extractEdges(node.resource)) {
      const dedupe = `${edge.kind}|${edge.to}|${edge.attribute ?? ""}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      if (edge.external) {
        node.referencesOut.push({ kind: edge.kind, external: true, name: edge.to });
        continue;
      }
      const target = local?.get(edge.to);
      if (!target || target === node) continue;

      node.referencesOut.push({
        kind: edge.kind,
        attribute: edge.attribute,
        external: false,
        node: target,
        name: edge.to,
      });
      target.referencesIn.push({
        kind: edge.kind,
        attribute: edge.attribute,
        external: false,
        node,
        name: node.logicalId,
      });
    }
  }
}

/** Extract every reference edge from a single resource. */
function extractEdges(resource: CfnResource): RawEdge[] {
  const edges: RawEdge[] = [];
  collect(resource.Properties, edges);

  for (const dep of toArray(resource.DependsOn)) {
    edges.push({ to: dep, kind: "DependsOn" });
  }
  return edges;
}

/** Recursively collect intrinsic references from an arbitrary value. */
function collect(value: unknown, edges: RawEdge[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, edges);
    return;
  }
  if (!value || typeof value !== "object") return;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1) {
    const [key, inner] = entries[0];
    if (key === "Ref" && typeof inner === "string") {
      if (!inner.startsWith("AWS::")) edges.push({ to: inner, kind: "Ref" });
      return;
    }
    if (key === "Fn::GetAtt") {
      const { logical, attribute } = parseGetAtt(inner);
      if (logical) edges.push({ to: logical, kind: "GetAtt", attribute });
      return;
    }
    if (key === "Fn::ImportValue") {
      edges.push({ to: importName(inner), kind: "Import", external: true });
      collect(inner, edges); // the imported name may itself contain refs
      return;
    }
    if (key === "Fn::Sub") {
      collectSub(inner, edges);
      return;
    }
  }
  for (const [, inner] of entries) collect(inner, edges);
}

function parseGetAtt(value: unknown): { logical?: string; attribute?: string } {
  if (Array.isArray(value)) {
    const [logical, ...rest] = value;
    return { logical: String(logical), attribute: rest.join(".") || undefined };
  }
  if (typeof value === "string") {
    const [logical, ...rest] = value.split(".");
    return { logical, attribute: rest.join(".") || undefined };
  }
  return {};
}

function collectSub(value: unknown, edges: RawEdge[]): void {
  const template = Array.isArray(value) ? value[0] : value;
  // Names declared in the variable map are local — they shadow logical ids.
  const locals =
    Array.isArray(value) && value[1] && typeof value[1] === "object"
      ? new Set(Object.keys(value[1] as Record<string, unknown>))
      : new Set<string>();

  if (typeof template === "string") {
    for (const match of template.matchAll(/\$\{([^}]+)\}/g)) {
      const token = match[1].trim();
      if (token.startsWith("!")) continue; // ${!Literal} — escaped, not a ref
      const [logical, ...rest] = token.split(".");
      if (!logical || logical.startsWith("AWS::") || locals.has(logical)) continue;
      const attribute = rest.join(".") || undefined;
      edges.push({ to: logical, kind: attribute ? "GetAtt" : "Sub", attribute });
    }
  }
  // The optional variable map of an Fn::Sub can hold further references.
  if (Array.isArray(value) && value[1]) collect(value[1], edges);
}

function importName(value: unknown): string {
  return typeof value === "string" ? value : "(imported value)";
}

/** Normalize an optional string-or-string-array (e.g. CloudFormation `DependsOn`). */
export function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
