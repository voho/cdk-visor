import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { VisorNode } from "@/lib/model";
import { buildGraph } from "@/lib/graph";
import { layout, LAYOUTS, type LayoutName, type Point } from "@/lib/layout";
import { badgeFor, resourceKindOf } from "@/lib/icons";

const NODE_W = 176;
const NODE_H = 48;
const SPACING = 210; // world units per layout "node unit"

interface Transform {
  x: number;
  y: number;
  k: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function GraphCanvas({
  focus,
  selectedPath,
  onSelect,
  onOpen,
}: {
  focus: VisorNode;
  selectedPath: string;
  onSelect: (n: VisorNode) => void;
  onOpen: (n: VisorNode) => void;
}) {
  const [algo, setAlgo] = useState<LayoutName>(
    () => (localStorage.getItem("visor.layout") as LayoutName) || "layered",
  );
  const [seed, setSeed] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const graph = useMemo(() => buildGraph(focus), [focus]);

  // Lay out, then scale abstract units into world coordinates.
  const positions = useMemo(() => {
    const raw = layout(
      algo,
      { ids: graph.nodes.map((n) => n.id), edges: graph.edges },
      seed,
    );
    const world = new Map<string, Point>();
    for (const [id, p] of raw) world.set(id, { x: p.x * SPACING, y: p.y * SPACING });
    return world;
  }, [graph, algo, seed]);

  // Center and scale the graph to fit the viewport.
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || positions.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - NODE_W / 2);
      maxX = Math.max(maxX, p.x + NODE_W / 2);
      minY = Math.min(minY, p.y - NODE_H / 2);
      maxY = Math.max(maxY, p.y + NODE_H / 2);
    }
    const pad = 60;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const k = clamp(Math.min(el.clientWidth / w, el.clientHeight / h), 0.1, 1.4);
    setView({
      k,
      x: el.clientWidth / 2 - ((minX + maxX) / 2) * k,
      y: el.clientHeight / 2 - ((minY + maxY) / 2) * k,
    });
  }, [positions]);

  // Refit whenever the layout changes.
  useLayoutEffect(() => fit(), [fit]);

  const onWheel = (e: React.WheelEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), 0.1, 3);
      const ratio = k / v.k;
      return { k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  };

  const onPanStart = (e: React.MouseEvent) => {
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: MouseEvent) => {
      if (!pan.current) return;
      setView((v) => ({
        ...v,
        x: pan.current!.vx + (ev.clientX - pan.current!.x),
        y: pan.current!.vy + (ev.clientY - pan.current!.y),
      }));
    };
    const up = () => {
      pan.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const chooseAlgo = (name: LayoutName) => {
    setAlgo(name);
    localStorage.setItem("visor.layout", name);
  };

  return (
    <div className="graph-wrap" ref={wrapRef} onWheel={onWheel}>
      <div className="graph-controls">
        <span className="gc-label">Layout</span>
        <select
          value={algo}
          onChange={(e) => chooseAlgo(e.target.value as LayoutName)}
        >
          {LAYOUTS.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label}
            </option>
          ))}
        </select>
        {algo === "force" && (
          <button className="btn ghost" title="Re-run layout" onClick={() => setSeed((s) => s + 1)}>
            ↻
          </button>
        )}
        <span className="gc-sep" />
        <button className="btn ghost" title="Zoom out" onClick={() => setView((v) => ({ ...v, k: clamp(v.k / 1.2, 0.1, 3) }))}>
          −
        </button>
        <button className="btn ghost" title="Zoom in" onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 1.2, 0.1, 3) }))}>
          +
        </button>
        <button className="btn ghost" title="Fit to view" onClick={fit}>
          ⤢
        </button>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="empty-canvas">
          <div style={{ fontSize: 30 }}>🍃</div>
          <div>Nothing to graph at this level.</div>
        </div>
      ) : (
        <svg className="graph-svg" onMouseDown={onPanStart}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--text-faint)" />
            </marker>
            <marker id="arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {graph.edges.map((e) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              const start = borderPoint(a, b);
              const end = borderPoint(b, a);
              const active = e.from === selectedPath || e.to === selectedPath;
              const dashed = e.kinds.length === 1 && e.kinds[0] === "DependsOn";
              return (
                <line
                  key={`${e.from}->${e.to}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  className={`graph-edge${active ? " active" : ""}`}
                  strokeDasharray={dashed ? "5 4" : undefined}
                  markerEnd={active ? "url(#arrow-hl)" : "url(#arrow)"}
                />
              );
            })}
            {graph.nodes.map((gn) => {
              const p = positions.get(gn.id);
              if (!p) return null;
              return (
                <GraphNodeBox
                  key={gn.id}
                  node={gn.node}
                  x={p.x}
                  y={p.y}
                  selected={gn.id === selectedPath}
                  onSelect={() => onSelect(gn.node)}
                  onOpen={() => onOpen(gn.node)}
                />
              );
            })}
          </g>
        </svg>
      )}
      <div className="graph-hint">
        {graph.nodes.length} nodes · {graph.edges.length} edges · drag to pan ·
        scroll to zoom · double-click to drill in
      </div>
    </div>
  );
}

function GraphNodeBox({
  node,
  x,
  y,
  selected,
  onSelect,
  onOpen,
}: {
  node: VisorNode;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const badge = badgeFor(node.kind, node.cfnType);
  const subtitle = node.cfnType ? resourceKindOf(node.cfnType) : node.kind;
  return (
    <g
      transform={`translate(${x - NODE_W / 2} ${y - NODE_H / 2})`}
      className={`graph-node${selected ? " selected" : ""}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <rect width={NODE_W} height={NODE_H} rx={9} className="gn-box" />
      <rect x={10} y={NODE_H / 2 - 9} width={26} height={18} rx={5} fill={badge.color} />
      <text x={23} y={NODE_H / 2 + 1} className="gn-badge" textAnchor="middle" dominantBaseline="middle">
        {badge.label}
      </text>
      <text x={46} y={NODE_H / 2 - 4} className="gn-title" dominantBaseline="middle">
        {truncate(node.name, 18)}
      </text>
      <text x={46} y={NODE_H / 2 + 11} className="gn-sub" dominantBaseline="middle">
        {truncate(subtitle ?? "", 22)}
      </text>
    </g>
  );
}

/** The point on the border of node `a`'s box along the direction toward `b`. */
function borderPoint(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return a;
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  const scale = Math.min(
    dx !== 0 ? hw / Math.abs(dx) : Infinity,
    dy !== 0 ? hh / Math.abs(dy) : Infinity,
  );
  return { x: a.x + dx * scale, y: a.y + dy * scale };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
