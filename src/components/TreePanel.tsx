import { useEffect, useMemo, useState } from "react";
import type { VisorNode } from "@/lib/model";
import { Badge } from "@/components/Badge";

export function TreePanel({
  root,
  selectedPath,
  focusPath,
  onSelect,
  onOpen,
}: {
  root: VisorNode;
  selectedPath: string;
  focusPath: string;
  onSelect: (n: VisorNode) => void;
  onOpen: (n: VisorNode) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([root.path]),
  );

  // Make sure the selected/focused node is always revealed.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const p of [selectedPath, focusPath]) {
        const parts = p.split("/");
        let acc = "";
        next.add("");
        for (const seg of parts) {
          acc = acc ? `${acc}/${seg}` : seg;
          next.add(acc);
        }
      }
      return next;
    });
  }, [selectedPath, focusPath]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  return (
    <div className="panel treepanel">
      <div className="panel-head">
        Construct Tree
        <span className="count">{root.descendantCount + 1}</span>
      </div>
      <div className="panel-scroll">
        <Row
          node={root}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={toggle}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}

function Row({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
  onOpen,
}: {
  node: VisorNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string;
  onToggle: (p: string) => void;
  onSelect: (n: VisorNode) => void;
  onOpen: (n: VisorNode) => void;
}) {
  const isOpen = expanded.has(node.path);
  const hasChildren = node.children.length > 0;
  const selected = node.path === selectedPath;

  const children = useMemo(
    () => (isOpen ? node.children : []),
    [isOpen, node.children],
  );

  return (
    <>
      <div
        className={`tree-row${selected ? " selected" : ""}`}
        style={{ paddingLeft: depth * 14 }}
        onClick={() => onSelect(node)}
        onDoubleClick={() => onOpen(node)}
      >
        <span
          className="twisty"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.path);
          }}
        >
          {hasChildren ? (isOpen ? "▾" : "▸") : ""}
        </span>
        <Badge kind={node.kind} cfnType={node.cfnType} />
        <span className="tname">{node.name}</span>
        {node.descendantCount > 0 && (
          <span className="tcount">{node.descendantCount}</span>
        )}
      </div>
      {children.map((child) => (
        <Row
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}
