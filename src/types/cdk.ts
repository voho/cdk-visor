/**
 * Type definitions for the AWS CDK artifacts produced by `cdk synth` into the
 * `cdk.out/` cloud assembly directory.
 *
 * These are intentionally permissive — different CDK versions add fields over
 * time, and we only depend on a stable subset.
 */

/** A single node in `tree.json` (the construct tree). */
export interface TreeNode {
  id: string;
  path: string;
  /** Children keyed by their construct id. */
  children?: Record<string, TreeNode>;
  /** Arbitrary metadata attached by CDK, e.g. cloudformation type/props. */
  attributes?: Record<string, unknown>;
  /** Information about the construct class that created this node. */
  constructInfo?: {
    fqn?: string;
    version?: string;
  };
}

/** The `tree.json` document. */
export interface TreeManifest {
  version: string;
  tree: TreeNode;
}

/** A metadata entry inside `manifest.json` artifacts. */
export interface MetadataEntry {
  type: string;
  data?: unknown;
  /** Stack trace (file/line frames) captured when CDK_DEBUG is enabled. */
  trace?: string[];
}

/** A single artifact (stack, asset, tree, etc.) in `manifest.json`. */
export interface Artifact {
  type: string;
  properties?: Record<string, unknown> & {
    templateFile?: string;
  };
  /** Construct-path keyed metadata, including logical ids and traces. */
  metadata?: Record<string, MetadataEntry[]>;
  displayName?: string;
  dependencies?: string[];
  environment?: string;
}

/** The `manifest.json` cloud-assembly document. */
export interface AssemblyManifest {
  version: string;
  artifacts?: Record<string, Artifact>;
}

/** A resource inside a CloudFormation template. */
export interface CfnResource {
  Type: string;
  Properties?: Record<string, unknown>;
  Metadata?: Record<string, unknown> & {
    "aws:cdk:path"?: string;
  };
  DependsOn?: string | string[];
  Condition?: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  [key: string]: unknown;
}

/** A CloudFormation template (`*.template.json`). */
export interface CfnTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, unknown>;
  Mappings?: Record<string, unknown>;
  Conditions?: Record<string, unknown>;
  Resources?: Record<string, CfnResource>;
  Outputs?: Record<string, unknown>;
  [key: string]: unknown;
}
