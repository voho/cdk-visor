import { useEffect, useMemo, useState } from "react";
import type { VisorNode } from "@/lib/model";
import { Badge } from "@/components/Badge";

interface FilterResult {
  /** Paths to render (matches + their ancestors), or null when not filtering. */
  visible: Set<string> | null;
  /** Paths that directly matched the query. */
  matched: Set<string> | null;
}

export function TreePanel({
  root,
  selectedPath,
  focusPath,
  width,
  onSelect,
  onOpen,
}: {
  root: VisorNode;
  selectedPath: string;
  focusPath: string;
  width: number;
  onSelect: (n: VisorNode) => void;
  onOpen: (n: VisorNode) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([root.path]),
  );
  const [filter, setFilter] = useState("");

  const { visible, matched } = useMemo(
    () => computeFilter(root, filter.trim().toLowerCase()),
    [root, filter],
  );

  // Make sure the selected/focused node is always revealed (when not filtering).
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add("");
      for (const p of [selectedPath, focusPath]) {
        let acc = "";
        for (const seg of p.split("/")) {
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
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const filtering = visible !== null;
  const nothingMatches = filtering && !visible!.has(root.path);

  return (
    <div className="panel treepanel" style={{ width }}>
      <div className="panel-head">
        Construct Tree
        <span className="count">{root.descendantCount + 1}</span>
      </div>
      <div className="tree-filter">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter constructs…"
          spellCheck={false}
        />
        {filter && (
          <button className="btn ghost" onClick={() => setFilter("")} title="Clear filter">
            ✕
          </button>
        )}
      </div>
      <div className="panel-scroll">
        {nothingMatches ? (
          <div className="note">No constructs match “{filter}”.</div>
        ) : (
          <Row
            node={root}
            depth={0}
            expanded={expanded}
            selectedPath={selectedPath}
            visible={visible}
            matched={matched}
            onToggle={toggle}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        )}
      </div>
    </div>
  );
}

function Row({
  node,
  depth,
  expanded,
  selectedPath,
  visible,
  matched,
  onToggle,
  onSelect,
  onOpen,
}: {
  node: VisorNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string;
  visible: Set<string> | null;
  matched: Set<string> | null;
  onToggle: (p: string) => void;
  onSelect: (n: VisorNode) => void;
  onOpen: (n: VisorNode) => void;
}) {
  const filtering = visible !== null;
  const childList = filtering
    ? node.children.filter((c) => visible!.has(c.path))
    : node.children;
  const hasChildren = childList.length > 0;
  const isOpen = filtering ? true : expanded.has(node.path);
  const selected = node.path === selectedPath;
  const isMatch = filtering && matched!.has(node.path);

  const children = isOpen ? childList : [];

  return (
    <>
      <div
        className={`tree-row${selected ? " selected" : ""}${isMatch ? " match" : ""}`}
        style={{ paddingLeft: depth * 14 }}
        onClick={() => onSelect(node)}
        onDoubleClick={() => onOpen(node)}
      >
        <span
          className="twisty"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren && !filtering) onToggle(node.path);
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
          visible={visible}
          matched={matched}
          onToggle={onToggle}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

/** Compute which nodes to show for a filter query (matches + their ancestors). */
function computeFilter(root: VisorNode, query: string): FilterResult {
  if (!query) return { visible: null, matched: null };
  const visible = new Set<string>();
  const matched = new Set<string>();

  const test = (n: VisorNode) =>
    n.name.toLowerCase().includes(query) ||
    n.path.toLowerCase().includes(query) ||
    (n.cfnType?.toLowerCase().includes(query) ?? false);

  const walk = (n: VisorNode): boolean => {
    let childVisible = false;
    for (const c of n.children) childVisible = walk(c) || childVisible;
    const selfMatch = test(n);
    if (selfMatch) matched.add(n.path);
    const show = selfMatch || childVisible;
    if (show) visible.add(n.path);
    return show;
  };
  walk(root);

  return { visible, matched };
}
