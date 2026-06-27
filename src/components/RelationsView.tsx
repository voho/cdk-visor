import type { ResolvedRef, VisorNode } from "@/lib/model";
import { Badge } from "@/components/Badge";

/**
 * A readable name for a reference target. CDK names the L1 inside an L2
 * "Resource"/"Default", so fall back to the parent construct's name, which is
 * what the author actually called it (e.g. "OrdersTable").
 */
function targetName(ref: ResolvedRef): string {
  const node = ref.node;
  if (!node) return ref.name;
  if ((node.name === "Resource" || node.name === "Default") && node.parent) {
    return node.parent.name;
  }
  return node.name;
}

/** Short label describing how one resource refers to another. */
function refLabel(ref: ResolvedRef): string {
  switch (ref.kind) {
    case "GetAtt":
      return ref.attribute ? `GetAtt · ${ref.attribute}` : "GetAtt";
    case "DependsOn":
      return "depends on";
    case "Import":
      return "imported";
    default:
      return ref.kind;
  }
}

export function RelationsView({
  node,
  onOpen,
}: {
  node: VisorNode;
  onOpen: (n: VisorNode) => void;
}) {
  const { referencesOut: out, referencesIn: inc } = node;
  if (out.length === 0 && inc.length === 0) {
    return <div className="note">No references to or from this resource.</div>;
  }
  return (
    <div>
      {out.length > 0 && (
        <Group title={`References (${out.length})`} refs={out} onOpen={onOpen} />
      )}
      {inc.length > 0 && (
        <Group title={`Referenced by (${inc.length})`} refs={inc} onOpen={onOpen} />
      )}
    </div>
  );
}

function Group({
  title,
  refs,
  onOpen,
}: {
  title: string;
  refs: ResolvedRef[];
  onOpen: (n: VisorNode) => void;
}) {
  return (
    <>
      <div className="section-title">{title}</div>
      <div style={{ padding: "0 8px 12px" }}>
        {refs.map((ref, i) => (
          <div
            key={`${ref.kind}-${ref.name}-${i}`}
            className="tree-row"
            style={{ borderRadius: 6, cursor: ref.node ? "pointer" : "default" }}
            onClick={() => ref.node && onOpen(ref.node)}
          >
            <span className="twisty" />
            <Badge
              kind={ref.node?.kind ?? "resource"}
              cfnType={ref.node?.cfnType}
            />
            <span className="tname">
              {targetName(ref)}
              {ref.external && <span className="pill" style={{ marginLeft: 8 }}>external</span>}
            </span>
            <span className="tcount">{refLabel(ref)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
