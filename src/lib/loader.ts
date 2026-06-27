/**
 * Loads CDK cloud-assembly artifacts from a variety of sources: the bundled
 * demo, a directory the user picks (a whole project or a `cdk.out/`), or files
 * dropped onto the window. Also provides a way to resolve source files
 * referenced by construct traces.
 */
import type { AssemblyManifest, CfnTemplate, TreeManifest } from "@/types/cdk";
import { buildModel, type CdkModel, type RawArtifacts } from "@/lib/model";

export interface ResolvedSource {
  path: string;
  content: string;
}

export interface SourceProvider {
  resolve(file: string): Promise<ResolvedSource | null>;
}

export interface LoadedAssembly {
  model: CdkModel;
  sources: SourceProvider;
  label: string;
}

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** Detect the single-page-app index.html returned for unknown static paths. */
function isHtmlFallback(text: string): boolean {
  const head = text.slice(0, 200).toLowerCase();
  return head.includes("<!doctype html") && text.includes('id="root"');
}

/** Resolves sources held in memory (from a picked/dropped directory). */
class MemorySourceProvider implements SourceProvider {
  constructor(private readonly files: Map<string, string>) {}

  async resolve(file: string): Promise<ResolvedSource | null> {
    if (this.files.has(file)) return { path: file, content: this.files.get(file)! };
    // Match by longest path suffix, then by basename as a last resort.
    const target = file.replace(/\\/g, "/");
    let best: { path: string; content: string } | null = null;
    let bestLen = -1;
    for (const [path, content] of this.files) {
      const p = path.replace(/\\/g, "/");
      if (target.endsWith(p) || p.endsWith(target)) {
        const len = Math.min(p.length, target.length);
        if (len > bestLen) {
          best = { path, content };
          bestLen = len;
        }
      }
    }
    if (best) return best;
    const base = basename(file);
    for (const [path, content] of this.files) {
      if (basename(path) === base) return { path, content };
    }
    return null;
  }
}

/** Resolves sources by fetching them relative to a base URL (used by the demo). */
class FetchSourceProvider implements SourceProvider {
  constructor(private readonly baseUrl: string) {}

  async resolve(file: string): Promise<ResolvedSource | null> {
    const rel = file.replace(/^\/+/, "");
    // Most specific first; the SPA host answers 200 with index.html for unknown
    // paths, so we also reject the HTML fallback explicitly.
    const candidates = [
      `${this.baseUrl}/src/${basename(file)}`,
      `${this.baseUrl}/${rel}`,
      `${this.baseUrl}/${basename(file)}`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const text = await res.text();
        if (isHtmlFallback(text)) continue;
        return { path: rel, content: text };
      } catch {
        /* try next candidate */
      }
    }
    return null;
  }
}

const emptySources: SourceProvider = { resolve: async () => null };

function isTemplateName(name: string): boolean {
  return name.endsWith(".template.json");
}

/** Build artifacts + sources from a flat list of (path, text) pairs. */
function assembleFromFiles(
  entries: { path: string; text: string }[],
): { artifacts: RawArtifacts; sources: SourceProvider } {
  let tree: TreeManifest | undefined;
  let manifest: AssemblyManifest | undefined;
  const templates = new Map<string, CfnTemplate>();
  const sources = new Map<string, string>();

  for (const { path, text } of entries) {
    const name = basename(path);
    try {
      if (name === "tree.json") {
        tree = JSON.parse(text) as TreeManifest;
        continue;
      }
      if (name === "manifest.json") {
        manifest = JSON.parse(text) as AssemblyManifest;
        continue;
      }
      if (isTemplateName(name)) {
        templates.set(name, JSON.parse(text) as CfnTemplate);
        continue;
      }
    } catch {
      // Not valid JSON for the role its name implies — keep it as a source file.
    }
    sources.set(path, text);
  }

  return {
    artifacts: { tree, manifest, templates },
    sources: new MemorySourceProvider(sources),
  };
}

/** Load from the bundled demo assembly under `public/demo`. */
export async function loadDemo(): Promise<LoadedAssembly> {
  const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/demo`;
  const tree = (await fetchJson(`${base}/tree.json`)) as TreeManifest | undefined;
  const manifest = (await fetchJson(`${base}/manifest.json`)) as
    | AssemblyManifest
    | undefined;

  const templates = new Map<string, CfnTemplate>();
  for (const stack of Object.values(manifest?.artifacts ?? {})) {
    const file = stack.properties?.templateFile;
    if (file && stack.type === "aws:cloudformation:stack") {
      const tpl = (await fetchJson(`${base}/${file}`)) as CfnTemplate | undefined;
      if (tpl) templates.set(file, tpl);
    }
  }

  const model = buildModel({ tree, manifest, templates });
  return {
    model,
    sources: new FetchSourceProvider(base),
    label: "Demo · ShopApp",
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

/** Load from a list of File objects (directory pick or drop). */
export async function loadFromFiles(files: File[]): Promise<LoadedAssembly> {
  const entries: { path: string; text: string }[] = [];
  for (const file of files) {
    // Only read text-ish files; skip obviously binary assets.
    if (file.size > 25 * 1024 * 1024) continue;
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    try {
      entries.push({ path, text: await file.text() });
    } catch {
      /* skip unreadable file */
    }
  }

  const { artifacts, sources } = assembleFromFiles(entries);
  if (!artifacts.tree && artifacts.templates.size === 0) {
    throw new Error(
      "No CDK artifacts found. Pick a project or cdk.out directory containing tree.json and/or *.template.json files.",
    );
  }

  const model = buildModel(artifacts);
  const label =
    artifacts.tree && artifacts.templates.size
      ? `Loaded · ${model.stacks.length} stack(s)`
      : artifacts.tree
        ? "Loaded · tree.json"
        : `Loaded · ${artifacts.templates.size} template(s)`;

  return { model, sources, label };
}

export { emptySources };
