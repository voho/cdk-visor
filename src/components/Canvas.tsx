import type { VisorNode } from "@/lib/model";
import { resourceKindOf } from "@/lib/icons";
import { Badge } from "@/components/Badge";

export function Canvas({
  focusNode,
  crumbs,
  selectedPath,
  onSelect,
  onOpen,
  onCrumb,
}: {
  focusNode: VisorNode;
  crumbs: VisorNode[];
  selectedPath: string;
  onSelect: (n: VisorNode) => void;
  onOpen: (n: VisorNode) => void;
  onCrumb: (n: VisorNode) => void;
}) {
  return (
    <div className="canvas">
      <div className="breadcrumbs">
        {crumbs.map((n, i) => (
          <span key={n.path} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <span className="crumb-sep">›</span>}
            <button
              className={`crumb${i === crumbs.length - 1 ? " current" : ""}`}
              onClick={() => onCrumb(n)}
            >
              <Badge kind={n.kind} cfnType={n.cfnType} />
              {n.name}
            </button>
          </span>
        ))}
      </div>

      <div className="canvas-head">
        <h1>
          <Badge kind={focusNode.kind} cfnType={focusNode.cfnType} large />
          {focusNode.name}
        </h1>
        {focusNode.constructInfo?.fqn && (
          <span className="meta">{focusNode.constructInfo.fqn}</span>
        )}
        <div className="stat">
          <span>
            <b>{focusNode.children.length}</b> children
          </span>
          <span>
            <b>{focusNode.resourceCount}</b> resources
          </span>
          <span>
            <b>{focusNode.descendantCount}</b> total
          </span>
        </div>
      </div>

      {focusNode.children.length === 0 ? (
        <div className="empty-canvas">
          <div style={{ fontSize: 30 }}>🍃</div>
          <div>This is a leaf construct — see its details on the right.</div>
        </div>
      ) : (
        <div className="cards">
          {focusNode.children.map((child) => (
            <NodeCard
              key={child.path}
              node={child}
              selected={child.path === selectedPath}
              onSelect={() => onSelect(child)}
              onOpen={() => onOpen(child)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeCard({
  node,
  selected,
  onSelect,
  onOpen,
}: {
  node: VisorNode;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const subtitle =
    node.cfnType ??
    node.constructInfo?.fqn ??
    (node.logicalId ? `#${node.logicalId}` : node.path);
  const canDrill = node.children.length > 0;

  return (
    <button
      className={`card${selected ? " selected" : ""}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className="card-top">
        <Badge kind={node.kind} cfnType={node.cfnType} large />
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{node.name}</div>
          <div className="card-sub">{subtitle}</div>
        </div>
      </div>
      <div className="card-foot">
        {node.kind === "resource" && node.cfnType ? (
          <span className="pill">{resourceKindOf(node.cfnType)}</span>
        ) : (
          <span className="pill">{kindLabel(node.kind)}</span>
        )}
        {canDrill && <span className="pill">{node.descendantCount} inside</span>}
        {canDrill ? (
          <span
            className="drill"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            open ›
          </span>
        ) : (
          <span className="drill">details ›</span>
        )}
      </div>
    </button>
  );
}

function kindLabel(kind: VisorNode["kind"]): string {
  switch (kind) {
    case "app":
      return "App";
    case "stage":
      return "Stage";
    case "stack":
      return "Stack";
    case "construct":
      return "Construct";
    default:
      return "Resource";
  }
}
