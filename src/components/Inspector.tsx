import { useMemo, useState } from "react";
import type { CdkModel, VisorNode } from "@/lib/model";
import type { SourceProvider } from "@/lib/loader";
import { Badge } from "@/components/Badge";
import { JsonBlock } from "@/components/JsonBlock";
import { SourceView } from "@/components/SourceView";
import { RelationsView } from "@/components/RelationsView";
import { docsUrlFor } from "@/lib/docs";
import { toArray } from "@/lib/references";

type TabId =
  | "overview"
  | "properties"
  | "cfn"
  | "relations"
  | "source"
  | "metadata";

export function Inspector({
  node,
  model,
  sources,
  width,
  onOpen,
}: {
  node: VisorNode;
  model: CdkModel;
  sources: SourceProvider;
  width: number;
  onOpen: (n: VisorNode) => void;
}) {
  const props = useMemo(() => cfnProps(node), [node]);
  const template = node.stackName
    ? model.stacks.find((s) => s.id === node.stackName)?.template
    : undefined;

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string; count?: number }[] = [
      { id: "overview", label: "Overview" },
    ];
    if (props) list.push({ id: "properties", label: "Properties" });
    if (node.resource || (node.kind === "stack" && template)) {
      list.push({ id: "cfn", label: "CloudFormation" });
    }
    const refCount = node.referencesOut.length + node.referencesIn.length;
    if (refCount > 0) {
      list.push({ id: "relations", label: "Relations", count: refCount });
    }
    list.push({ id: "source", label: "Source", count: node.traces.length || undefined });
    list.push({ id: "metadata", label: "Metadata", count: node.metadata.length || undefined });
    return list;
  }, [props, node, template]);

  const [tab, setTab] = useState<TabId>("overview");
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "overview";

  return (
    <div className="panel inspector" style={{ width }}>
      <div className="insp-head">
        <div className="row">
          <Badge kind={node.kind} cfnType={node.cfnType} large />
          <h2 title={node.name}>{node.name}</h2>
        </div>
        <div className="path">{node.path || "(root)"}</div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="insp-body">
        {activeTab === "overview" && <Overview node={node} onOpen={onOpen} />}
        {activeTab === "properties" && <JsonBlock value={props} />}
        {activeTab === "cfn" && (
          <CfnTab node={node} template={template} />
        )}
        {activeTab === "relations" && (
          <RelationsView node={node} onOpen={onOpen} />
        )}
        {activeTab === "source" && <SourceView node={node} sources={sources} />}
        {activeTab === "metadata" && <MetadataTab node={node} />}
      </div>
    </div>
  );
}

function Overview({
  node,
  onOpen,
}: {
  node: VisorNode;
  onOpen: (n: VisorNode) => void;
}) {
  const docs = docsUrlFor(node.constructInfo?.fqn);
  const dependsOn = toArray(node.resource?.DependsOn);
  return (
    <div>
      <div className="kv">
        <div className="k">Kind</div>
        <div className="v">{node.kind}</div>
      </div>
      {node.constructInfo?.fqn && (
        <div className="kv">
          <div className="k">Construct</div>
          <div className="v">
            {docs ? (
              <a href={docs} target="_blank" rel="noreferrer">
                {node.constructInfo.fqn} ↗
              </a>
            ) : (
              node.constructInfo.fqn
            )}
          </div>
        </div>
      )}
      {node.constructInfo?.version && (
        <div className="kv">
          <div className="k">Version</div>
          <div className="v">{node.constructInfo.version}</div>
        </div>
      )}
      {node.cfnType && (
        <div className="kv">
          <div className="k">CFN Type</div>
          <div className="v">{node.cfnType}</div>
        </div>
      )}
      {node.logicalId && (
        <div className="kv">
          <div className="k">Logical ID</div>
          <div className="v">{node.logicalId}</div>
        </div>
      )}
      {node.stackName && (
        <div className="kv">
          <div className="k">Stack</div>
          <div className="v">{node.stackName}</div>
        </div>
      )}
      <div className="kv">
        <div className="k">Children</div>
        <div className="v">{node.children.length}</div>
      </div>
      <div className="kv">
        <div className="k">Resources</div>
        <div className="v">{node.resourceCount}</div>
      </div>
      {(node.referencesOut.length > 0 || node.referencesIn.length > 0) && (
        <div className="kv">
          <div className="k">References</div>
          <div className="v">
            {node.referencesOut.length} out · {node.referencesIn.length} in
          </div>
        </div>
      )}

      {node.parent && (
        <>
          <div className="section-title">Navigate</div>
          <div style={{ padding: "0 14px 10px" }}>
            <button className="btn" onClick={() => onOpen(node.parent!)}>
              ↑ {node.parent.name}
            </button>
          </div>
        </>
      )}

      {node.children.length > 0 && (
        <>
          <div className="section-title">Children ({node.children.length})</div>
          <div style={{ padding: "0 8px 14px" }}>
            {node.children.map((c) => (
              <div
                key={c.path}
                className="tree-row"
                onClick={() => onOpen(c)}
                style={{ borderRadius: 6 }}
              >
                <span className="twisty" />
                <Badge kind={c.kind} cfnType={c.cfnType} />
                <span className="tname">{c.name}</span>
                {c.descendantCount > 0 && (
                  <span className="tcount">{c.descendantCount}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {dependsOn.length > 0 && (
        <>
          <div className="section-title">Depends On</div>
          <div style={{ padding: "0 14px 16px", fontFamily: "var(--mono)", fontSize: 12.5 }}>
            {dependsOn.map((d) => (
              <div key={d} style={{ color: "var(--text-dim)" }}>
                {d}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CfnTab({
  node,
  template,
}: {
  node: VisorNode;
  template?: import("@/types/cdk").CfnTemplate;
}) {
  if (node.resource) {
    return (
      <div>
        <div className="section-title">{node.logicalId ?? "Resource"}</div>
        <JsonBlock value={node.resource} />
      </div>
    );
  }
  if (node.kind === "stack" && template) {
    const counts = {
      Resources: Object.keys(template.Resources ?? {}).length,
      Parameters: Object.keys(template.Parameters ?? {}).length,
      Outputs: Object.keys(template.Outputs ?? {}).length,
      Conditions: Object.keys(template.Conditions ?? {}).length,
      Mappings: Object.keys(template.Mappings ?? {}).length,
    };
    const outputs = Object.entries(template.Outputs ?? {});
    const params = Object.entries(template.Parameters ?? {});
    return (
      <div>
        {Object.entries(counts).map(([k, v]) => (
          <div className="kv" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
        {params.length > 0 && (
          <>
            <div className="section-title">Parameters</div>
            {params.map(([name, def]) => (
              <div className="kv" key={name}>
                <div className="k">{name}</div>
                <div className="v">{describeParameter(def)}</div>
              </div>
            ))}
          </>
        )}
        {outputs.length > 0 && (
          <>
            <div className="section-title">Outputs</div>
            {outputs.map(([name, def]) => (
              <div className="kv" key={name}>
                <div className="k">{name}</div>
                <div className="v">{describeOutput(def)}</div>
              </div>
            ))}
          </>
        )}
        <div className="section-title">Full Template</div>
        <JsonBlock value={template} />
      </div>
    );
  }
  return <div className="note">No CloudFormation output for this node.</div>;
}

function MetadataTab({ node }: { node: VisorNode }) {
  const hasAttrs = node.attributes && Object.keys(node.attributes).length > 0;
  if (!hasAttrs && node.metadata.length === 0) {
    return <div className="note">No metadata for this node.</div>;
  }
  return (
    <div>
      {hasAttrs && (
        <>
          <div className="section-title">Tree Attributes</div>
          <JsonBlock value={node.attributes} />
        </>
      )}
      {node.metadata.length > 0 && (
        <>
          <div className="section-title">Manifest Metadata</div>
          <JsonBlock value={node.metadata} />
        </>
      )}
    </div>
  );
}

function cfnProps(node: VisorNode): Record<string, unknown> | undefined {
  const fromTree = node.attributes?.["aws:cdk:cloudformation:props"];
  if (fromTree && typeof fromTree === "object") {
    return fromTree as Record<string, unknown>;
  }
  if (node.resource?.Properties) return node.resource.Properties;
  return undefined;
}

function describeParameter(def: unknown): string {
  const p = def as { Type?: string; Default?: unknown; Description?: string };
  const parts = [p.Type ?? "String"];
  if (p.Default !== undefined) parts.push(`default: ${JSON.stringify(p.Default)}`);
  return parts.join(" · ");
}

function describeOutput(def: unknown): string {
  const o = def as { Description?: string; Export?: { Name?: unknown } };
  if (o.Description) return o.Description;
  if (o.Export?.Name) return `export: ${JSON.stringify(o.Export.Name)}`;
  return "—";
}
