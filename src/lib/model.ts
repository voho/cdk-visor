/**
 * Builds a single, navigable model of a CDK application out of the raw cloud
 * assembly artifacts (`tree.json`, `manifest.json` and the CloudFormation
 * templates). The construct tree is the spine; every node is enriched with its
 * logical id, its synthesized CloudFormation resource and any source traces so
 * the UI can drill from the app root all the way down to source code.
 */
import type {
  AssemblyManifest,
  CfnResource,
  CfnTemplate,
  MetadataEntry,
  TreeManifest,
  TreeNode,
} from "@/types/cdk";
import { buildReferences } from "@/lib/references";

export type NodeKind = "app" | "stage" | "stack" | "construct" | "resource";

/** How one resource refers to another in a CloudFormation template. */
export type RefKind = "Ref" | "GetAtt" | "Sub" | "DependsOn" | "Import";

/** A resolved reference edge between two resources (or to an external import). */
export interface ResolvedRef {
  kind: RefKind;
  /** Attribute name for `Fn::GetAtt` references. */
  attribute?: string;
  /** True when the target lives outside this assembly (e.g. `Fn::ImportValue`). */
  external: boolean;
  /** The resolved node, when the reference points within the assembly. */
  node?: VisorNode;
  /** The target/source logical id or import name (always present). */
  name: string;
}

/** A single frame of a captured source trace. */
export interface TraceFrame {
  raw: string;
  /** Resolved file path, when one could be parsed out of the frame. */
  file?: string;
  line?: number;
  column?: number;
  /** The function/symbol named in the frame, when present. */
  symbol?: string;
}

export interface VisorNode {
  /** Stable id (the normalized construct path, "" for the root). */
  id: string;
  path: string;
  /** Last path segment — what we show as the title. */
  name: string;
  kind: NodeKind;
  constructInfo?: { fqn?: string; version?: string };
  attributes?: Record<string, unknown>;

  /** Resolved CloudFormation facts (for resource nodes). */
  cfnType?: string;
  logicalId?: string;
  resource?: CfnResource;
  /** Name of the stack/template this node was synthesized into. */
  stackName?: string;

  /** Source traces captured during synthesis (requires CDK_DEBUG). */
  traces: TraceFrame[];
  /** Raw manifest metadata entries keyed to this construct path. */
  metadata: MetadataEntry[];

  parent?: VisorNode;
  children: VisorNode[];

  /** Outgoing CloudFormation references (this resource → others). */
  referencesOut: ResolvedRef[];
  /** Incoming CloudFormation references (others → this resource). */
  referencesIn: ResolvedRef[];

  /** Aggregate counts, precomputed for the UI. */
  descendantCount: number;
  resourceCount: number;
}

export interface StackInfo {
  /** Artifact id from the manifest (usually the stack name). */
  id: string;
  displayName: string;
  templateFile?: string;
  template?: CfnTemplate;
  environment?: string;
}

export interface CdkModel {
  root: VisorNode;
  /** Every node indexed by its normalized path. */
  index: Map<string, VisorNode>;
  /** Flat list, useful for search. */
  all: VisorNode[];
  stacks: StackInfo[];
  /** Templates by file name. */
  templates: Map<string, CfnTemplate>;
  manifest?: AssemblyManifest;
  treeVersion?: string;
  warnings: string[];
}

export interface RawArtifacts {
  tree?: TreeManifest;
  manifest?: AssemblyManifest;
  /** CloudFormation templates keyed by their file name. */
  templates: Map<string, CfnTemplate>;
}

const norm = (p: string): string => p.replace(/^\/+/, "");

function classify(node: TreeNode, hasCfnType: boolean): NodeKind {
  const fqn = node.constructInfo?.fqn ?? "";
  if (hasCfnType) return "resource";
  if (/(^|\.)App$/.test(fqn)) return "app";
  if (/(^|\.)Stage$/.test(fqn)) return "stage";
  if (/(^|\.)Stack$/.test(fqn)) return "stack";
  return "construct";
}

/** Parse a raw stack-trace frame into something structured, best-effort. */
export function parseTraceFrame(raw: string): TraceFrame {
  const frame: TraceFrame = { raw: raw.trim() };
  // Matches "at Symbol (/path/to/file.ts:12:34)" and "/path/file.ts:12:34".
  const withSymbol = raw.match(/at\s+(.+?)\s+\(([^()]+?):(\d+):(\d+)\)/);
  if (withSymbol) {
    frame.symbol = withSymbol[1];
    frame.file = withSymbol[2];
    frame.line = Number(withSymbol[3]);
    frame.column = Number(withSymbol[4]);
    return frame;
  }
  const bare = raw.match(/([^\s()]+?):(\d+):(\d+)/);
  if (bare) {
    frame.file = bare[1];
    frame.line = Number(bare[2]);
    frame.column = Number(bare[3]);
  }
  return frame;
}

/**
 * Index every resource of every template by its `aws:cdk:path` metadata so a
 * construct-tree node can be linked to its synthesized resource directly.
 */
function indexResourcesByPath(
  templates: Map<string, CfnTemplate>,
): Map<string, { logicalId: string; resource: CfnResource; templateFile: string }> {
  const byPath = new Map<
    string,
    { logicalId: string; resource: CfnResource; templateFile: string }
  >();
  for (const [templateFile, template] of templates) {
    const resources = template.Resources ?? {};
    for (const [logicalId, resource] of Object.entries(resources)) {
      const cdkPath = resource.Metadata?.["aws:cdk:path"];
      if (typeof cdkPath === "string") {
        byPath.set(norm(cdkPath), { logicalId, resource, templateFile });
      }
    }
  }
  return byPath;
}

/**
 * Collect manifest metadata (logical ids + traces) keyed by construct path.
 * Also records which stack each path belongs to.
 */
function indexManifest(manifest: AssemblyManifest | undefined): {
  metaByPath: Map<string, MetadataEntry[]>;
  logicalIdByPath: Map<string, string>;
  stackByPath: Map<string, string>;
} {
  const metaByPath = new Map<string, MetadataEntry[]>();
  const logicalIdByPath = new Map<string, string>();
  const stackByPath = new Map<string, string>();
  if (!manifest?.artifacts) {
    return { metaByPath, logicalIdByPath, stackByPath };
  }
  for (const [artifactId, artifact] of Object.entries(manifest.artifacts)) {
    if (artifact.type !== "aws:cloudformation:stack" || !artifact.metadata) {
      continue;
    }
    for (const [rawPath, entries] of Object.entries(artifact.metadata)) {
      const path = norm(rawPath);
      const existing = metaByPath.get(path) ?? [];
      existing.push(...entries);
      metaByPath.set(path, existing);
      stackByPath.set(path, artifactId);
      for (const entry of entries) {
        if (entry.type === "aws:cdk:logicalId" && typeof entry.data === "string") {
          logicalIdByPath.set(path, entry.data);
        }
      }
    }
  }
  return { metaByPath, logicalIdByPath, stackByPath };
}

function collectTraces(entries: MetadataEntry[]): TraceFrame[] {
  const frames: TraceFrame[] = [];
  for (const entry of entries) {
    if (Array.isArray(entry.trace)) {
      for (const line of entry.trace) frames.push(parseTraceFrame(line));
    }
  }
  return frames;
}

/** Build the full model from raw artifacts. */
export function buildModel(raw: RawArtifacts): CdkModel {
  const warnings: string[] = [];
  const templates = raw.templates;
  const resourcesByPath = indexResourcesByPath(templates);
  const { metaByPath, logicalIdByPath, stackByPath } = indexManifest(raw.manifest);

  const stacks: StackInfo[] = [];
  if (raw.manifest?.artifacts) {
    for (const [id, artifact] of Object.entries(raw.manifest.artifacts)) {
      if (artifact.type !== "aws:cloudformation:stack") continue;
      const templateFile = artifact.properties?.templateFile;
      stacks.push({
        id,
        displayName: artifact.displayName ?? id,
        templateFile,
        template: templateFile ? templates.get(templateFile) : undefined,
        environment: artifact.environment,
      });
    }
  }

  const index = new Map<string, VisorNode>();
  const all: VisorNode[] = [];

  const treeRoot = raw.tree?.tree;
  if (!treeRoot) {
    warnings.push("No tree.json found — only CloudFormation templates were loaded.");
  }

  const buildNode = (
    raw: TreeNode,
    parent: VisorNode | undefined,
    inheritedStack: string | undefined,
  ): VisorNode => {
    const path = norm(raw.path ?? "");
    const attributes = raw.attributes;
    const cfnType =
      typeof attributes?.["aws:cdk:cloudformation:type"] === "string"
        ? (attributes["aws:cdk:cloudformation:type"] as string)
        : undefined;
    const kind = classify(raw, Boolean(cfnType));

    const resolved = resourcesByPath.get(path);
    const metadata = metaByPath.get(path) ?? [];
    const stackName =
      (kind === "stack" ? raw.id : undefined) ??
      stackByPath.get(path) ??
      resolved?.templateFile?.replace(/\.template\.json$/, "") ??
      inheritedStack;

    const node: VisorNode = {
      id: path,
      path,
      name: raw.id || path.split("/").pop() || "App",
      kind,
      constructInfo: raw.constructInfo,
      attributes,
      cfnType,
      logicalId: resolved?.logicalId ?? logicalIdByPath.get(path),
      resource: resolved?.resource,
      stackName,
      traces: collectTraces(metadata),
      metadata,
      parent,
      children: [],
      referencesOut: [],
      referencesIn: [],
      descendantCount: 0,
      resourceCount: 0,
    };

    const nextStack = kind === "stack" ? raw.id : stackName;
    const childEntries = Object.values(raw.children ?? {});
    for (const child of childEntries) {
      node.children.push(buildNode(child, node, nextStack));
    }
    // Stable, friendly ordering: stacks/constructs first, then leaf resources.
    node.children.sort((a, b) => {
      const order = (n: VisorNode) => (n.kind === "resource" ? 1 : 0);
      const byKind = order(a) - order(b);
      return byKind !== 0 ? byKind : a.name.localeCompare(b.name);
    });

    index.set(path, node);
    all.push(node);
    return node;
  };

  let root: VisorNode;
  if (treeRoot) {
    root = buildNode(treeRoot, undefined, undefined);
  } else {
    // Synthesize a root purely from templates so the viewer still works.
    root = synthesizeRootFromTemplates(templates, index, all);
  }

  // Roll up aggregate counts bottom-up.
  const rollup = (n: VisorNode): void => {
    let descendants = 0;
    let resources = n.kind === "resource" ? 1 : 0;
    for (const c of n.children) {
      rollup(c);
      descendants += 1 + c.descendantCount;
      resources += c.resourceCount;
    }
    n.descendantCount = descendants;
    n.resourceCount = resources;
  };
  rollup(root);

  // A stack node should carry the same manifest artifact id its resources
  // resolved to (resources get it from the manifest, the stack node only had
  // its local tree id). This keeps the inspector's template lookup working even
  // when the artifact id differs from the tree id — e.g. for stage-nested stacks.
  for (const node of all) {
    if (node.kind !== "resource" || !node.stackName) continue;
    let ancestor = node.parent;
    while (ancestor && ancestor.kind !== "stack") ancestor = ancestor.parent;
    if (ancestor) ancestor.stackName = node.stackName;
  }

  // Link resources to each other via their CloudFormation references.
  buildReferences(all);

  return {
    root,
    index,
    all,
    stacks,
    templates,
    manifest: raw.manifest,
    treeVersion: raw.tree?.version,
    warnings,
  };
}

/** Fallback model when there is no tree.json — group resources by template. */
function synthesizeRootFromTemplates(
  templates: Map<string, CfnTemplate>,
  index: Map<string, VisorNode>,
  all: VisorNode[],
): VisorNode {
  const root: VisorNode = {
    id: "",
    path: "",
    name: "App",
    kind: "app",
    traces: [],
    metadata: [],
    children: [],
    referencesOut: [],
    referencesIn: [],
    descendantCount: 0,
    resourceCount: 0,
  };
  index.set("", root);
  all.push(root);

  for (const [templateFile, template] of templates) {
    const stackName = templateFile.replace(/\.template\.json$/, "");
    const stackNode: VisorNode = {
      id: stackName,
      path: stackName,
      name: stackName,
      kind: "stack",
      stackName,
      traces: [],
      metadata: [],
      parent: root,
      children: [],
      referencesOut: [],
      referencesIn: [],
      descendantCount: 0,
      resourceCount: 0,
    };
    index.set(stackName, stackNode);
    all.push(stackNode);
    root.children.push(stackNode);

    for (const [logicalId, resource] of Object.entries(template.Resources ?? {})) {
      const path = `${stackName}/${logicalId}`;
      const resNode: VisorNode = {
        id: path,
        path,
        name: logicalId,
        kind: "resource",
        cfnType: resource.Type,
        logicalId,
        resource,
        stackName,
        traces: [],
        metadata: [],
        parent: stackNode,
        children: [],
        referencesOut: [],
        referencesIn: [],
        descendantCount: 0,
        resourceCount: 0,
      };
      index.set(path, resNode);
      all.push(resNode);
      stackNode.children.push(resNode);
    }
  }
  return root;
}

/** Path from the root down to (and including) the given node. */
export function ancestry(node: VisorNode): VisorNode[] {
  const chain: VisorNode[] = [];
  let cur: VisorNode | undefined = node;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  return chain;
}
