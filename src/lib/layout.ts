/**
 * Auto-layout algorithms for the relationship graph. Each takes a set of node
 * ids and directed edges and returns a position per node in abstract "node
 * units" (~1 unit ≈ one node spacing); the renderer scales and fits these to
 * the viewport. Implemented from scratch to stay dependency-free.
 */
export type LayoutName = "layered" | "force" | "circular" | "grid";

export interface Point {
  x: number;
  y: number;
}

export interface LayoutInput {
  ids: string[];
  edges: { from: string; to: string }[];
}

export const LAYOUTS: { name: LayoutName; label: string }[] = [
  { name: "layered", label: "Hierarchical" },
  { name: "force", label: "Force-directed" },
  { name: "circular", label: "Circular" },
  { name: "grid", label: "Grid" },
];

export function layout(name: LayoutName, input: LayoutInput, seed = 1): Map<string, Point> {
  switch (name) {
    case "grid":
      return gridLayout(input);
    case "circular":
      return circularLayout(input);
    case "force":
      return forceLayout(input, seed);
    case "layered":
    default:
      return layeredLayout(input);
  }
}

/* ------------------------------- grid ---------------------------------- */

function gridLayout({ ids }: LayoutInput): Map<string, Point> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const pos = new Map<string, Point>();
  ids.forEach((id, i) => {
    pos.set(id, { x: (i % cols) * 1.35, y: Math.floor(i / cols) * 1.0 });
  });
  return pos;
}

/* ------------------------------ circular -------------------------------- */

function circularLayout({ ids }: LayoutInput): Map<string, Point> {
  const pos = new Map<string, Point>();
  const n = ids.length;
  if (n === 1) return pos.set(ids[0], { x: 0, y: 0 }), pos;
  const radius = Math.max(1, n / (2 * Math.PI)) * 1.4;
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    pos.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  return pos;
}

/* ------------------------------ layered --------------------------------- */

/**
 * A lightweight Sugiyama-style layered layout: assign each node to a layer by
 * its longest dependency path, then reduce crossings with a few barycenter
 * sweeps. Cycles are tolerated (iteration count is bounded).
 */
function layeredLayout({ ids, edges }: LayoutInput): Map<string, Point> {
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  // Longest-path layering via bounded relaxation (Bellman-Ford style).
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of edges) {
      if (e.from === e.to) continue;
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group nodes per layer.
  const layers: string[][] = [];
  for (const id of ids) {
    const l = layer.get(id) ?? 0;
    (layers[l] ??= []).push(id);
  }

  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  const append = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const e of edges) {
    append(succ, e.from, e.to);
    append(pred, e.to, e.from);
  }

  const orderIndex = new Map<string, number>();
  const reindex = () =>
    layers.forEach((row) => row.forEach((id, i) => orderIndex.set(id, i)));
  reindex();

  const barycenter = (id: string, neighbours: Map<string, string[]>) => {
    const ns = neighbours.get(id);
    if (!ns || ns.length === 0) return orderIndex.get(id) ?? 0;
    return ns.reduce((s, n) => s + (orderIndex.get(n) ?? 0), 0) / ns.length;
  };

  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const neighbours = downward ? pred : succ;
    const order = downward
      ? layers.map((_, i) => i)
      : layers.map((_, i) => layers.length - 1 - i);
    for (const li of order) {
      layers[li]?.sort((a, b) => barycenter(a, neighbours) - barycenter(b, neighbours));
    }
    reindex();
  }

  const pos = new Map<string, Point>();
  layers.forEach((row, l) => {
    const offset = (row.length - 1) / 2;
    row.forEach((id, i) => pos.set(id, { x: (i - offset) * 1.3, y: l * 1.5 }));
  });
  return pos;
}

/* ------------------------------- force ---------------------------------- */

/** Fruchterman-Reingold force-directed layout with deterministic seeding. */
function forceLayout({ ids, edges }: LayoutInput, seed: number): Map<string, Point> {
  const n = ids.length;
  const pos = new Map<string, Point>();
  if (n === 1) return pos.set(ids[0], { x: 0, y: 0 }), pos;

  // Deterministic start on a circle, jittered so symmetric graphs unfold.
  const rand = (i: number) => {
    const v = Math.sin((i + 1) * 12.9898 * seed) * 43758.5453;
    return v - Math.floor(v);
  };
  const radius = Math.sqrt(n);
  ids.forEach((id, i) => {
    const a = (2 * Math.PI * i) / n;
    pos.set(id, {
      x: Math.cos(a) * radius + (rand(i) - 0.5) * 0.5,
      y: Math.sin(a) * radius + (rand(i + n) - 0.5) * 0.5,
    });
  });

  const k = 1.1; // ideal edge length
  let temp = radius * 0.6;
  const iterations = 320;

  for (let step = 0; step < iterations; step++) {
    const disp = new Map<string, Point>(ids.map((id) => [id, { x: 0, y: 0 }]));

    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        if (dist < 0.01) {
          dx = (rand(i + step) - 0.5) * 0.01;
          dy = (rand(j + step) - 0.5) * 0.01;
          dist = Math.hypot(dx, dy) || 0.01;
        }
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const di = disp.get(ids[i])!;
        const dj = disp.get(ids[j])!;
        di.x += fx;
        di.y += fy;
        dj.x -= fx;
        dj.y -= fy;
      }
    }

    // Attraction along edges.
    for (const e of edges) {
      if (e.from === e.to) continue;
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp.get(e.from)!.x -= fx;
      disp.get(e.from)!.y -= fy;
      disp.get(e.to)!.x += fx;
      disp.get(e.to)!.y += fy;
    }

    // Mild gravity toward the center keeps disconnected nodes from drifting off.
    const gravity = 0.06;
    for (const id of ids) {
      const p = pos.get(id)!;
      const d = disp.get(id)!;
      d.x -= p.x * gravity;
      d.y -= p.y * gravity;
    }

    // Apply displacement, capped by the cooling temperature.
    for (const id of ids) {
      const d = disp.get(id)!;
      const len = Math.hypot(d.x, d.y) || 0.01;
      const p = pos.get(id)!;
      p.x += (d.x / len) * Math.min(len, temp);
      p.y += (d.y / len) * Math.min(len, temp);
    }
    temp = Math.max(0.02, temp * 0.97);
  }

  return pos;
}
