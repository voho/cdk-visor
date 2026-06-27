/**
 * Lightweight fuzzy/substring search over the construct model. Matches against
 * a node's name, path, construct fqn, CloudFormation type and logical id, and
 * ranks more specific matches higher.
 */
import type { VisorNode } from "@/lib/model";

export interface SearchHit {
  node: VisorNode;
  score: number;
}

function scoreField(field: string | undefined, query: string): number {
  if (!field) return 0;
  const f = field.toLowerCase();
  const idx = f.indexOf(query);
  if (idx === -1) return 0;
  // Earlier matches and exact matches score higher.
  let score = 1 - idx / (f.length + 1);
  if (f === query) score += 1;
  else if (f.startsWith(query)) score += 0.5;
  return score;
}

export function search(nodes: VisorNode[], rawQuery: string, limit = 40): SearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const hits: SearchHit[] = [];
  for (const node of nodes) {
    const score =
      scoreField(node.name, query) * 3 +
      scoreField(node.path, query) * 1.5 +
      scoreField(node.cfnType, query) * 2 +
      scoreField(node.logicalId, query) * 2 +
      scoreField(node.constructInfo?.fqn, query) * 1;
    if (score > 0) hits.push({ node, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
