import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadDemo,
  loadFromFiles,
  type LoadedAssembly,
} from "@/lib/loader";
import { ancestry, type VisorNode } from "@/lib/model";
import { TopBar } from "@/components/TopBar";
import { TreePanel } from "@/components/TreePanel";
import { Canvas, type ViewMode } from "@/components/Canvas";
import { Inspector } from "@/components/Inspector";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Welcome } from "@/components/Welcome";
import { Resizer } from "@/components/Resizer";
import { filesFromDataTransfer } from "@/lib/dnd";
import { useResizable } from "@/lib/useResizable";
import { formatHash, parseHash } from "@/lib/url";

const usePersistentToggle = (key: string, initial: boolean) => {
  const [on, setOn] = useState<boolean>(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === "1";
  });
  useEffect(() => {
    localStorage.setItem(key, on ? "1" : "0");
  }, [key, on]);
  return [on, setOn] as const;
};

type Status = "loading" | "ready" | "error";

export default function App() {
  const [assembly, setAssembly] = useState<LoadedAssembly | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>("");

  const [focusPath, setFocusPath] = useState<string>("");
  const [selectedPath, setSelectedPath] = useState<string>("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("visor.viewMode") as ViewMode) || "cards",
  );
  const [showTree, setShowTree] = usePersistentToggle("visor.showTree", true);
  const [showInspector, setShowInspector] = usePersistentToggle(
    "visor.showInspector",
    true,
  );
  const [dragging, setDragging] = useState(false);

  const tree = useResizable("visor.treeWidth", 290, 200, 520, "right");
  const inspector = useResizable("visor.inspectorWidth", 420, 300, 720, "left");

  const dirInputRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<string>("");

  const ingest = useCallback(
    (next: LoadedAssembly, honorHash = false) => {
      setAssembly(next);
      setStatus("ready");
      setError("");

      const idx = next.model.index;
      const hash = honorHash ? parseHash() : null;
      const focus = hash && idx.has(hash.focus) ? hash.focus : next.model.root.path;
      const selected =
        hash && idx.has(hash.selected) ? hash.selected : focus;
      lastFocus.current = focus;
      setFocusPath(focus);
      setSelectedPath(selected);
    },
    [],
  );

  // Auto-load the bundled demo on first paint (honoring a shared URL).
  useEffect(() => {
    let alive = true;
    loadDemo()
      .then((a) => {
        if (alive) ingest(a, true);
      })
      .catch((e) => {
        if (alive) {
          setStatus("error");
          setError(String(e?.message ?? e));
        }
      });
    return () => {
      alive = false;
    };
  }, [ingest]);

  const openFiles = useCallback(
    async (files: File[]) => {
      setStatus("loading");
      try {
        ingest(await loadFromFiles(files));
      } catch (e) {
        setStatus("error");
        setError(String((e as Error)?.message ?? e));
      }
    },
    [ingest],
  );

  const reloadDemo = useCallback(async () => {
    setStatus("loading");
    try {
      ingest(await loadDemo());
    } catch (e) {
      setStatus("error");
      setError(String((e as Error)?.message ?? e));
    }
  }, [ingest]);

  const model = assembly?.model ?? null;

  const focusNode: VisorNode | null = useMemo(() => {
    if (!model) return null;
    return model.index.get(focusPath) ?? model.root;
  }, [model, focusPath]);

  const selectedNode: VisorNode | null = useMemo(() => {
    if (!model) return null;
    return model.index.get(selectedPath) ?? focusNode;
  }, [model, selectedPath, focusNode]);

  /** Select a node (show it in the inspector). */
  const select = useCallback((node: VisorNode) => setSelectedPath(node.path), []);

  /** Open a node: drill the canvas into it (or its parent when it's a leaf). */
  const open = useCallback((node: VisorNode) => {
    setSelectedPath(node.path);
    if (node.children.length > 0) setFocusPath(node.path);
    else if (node.parent) setFocusPath(node.parent.path);
  }, []);

  const goUp = useCallback(() => {
    if (focusNode?.parent) {
      setFocusPath(focusNode.parent.path);
      setSelectedPath(focusNode.parent.path);
    }
  }, [focusNode]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (searchOpen || typing) return;

      if (e.key === "Escape" || (e.key === "Backspace" && !typing)) {
        e.preventDefault();
        goUp();
        return;
      }
      if (!focusNode) return;
      const sibs = focusNode.children;
      if (sibs.length === 0) return;
      const idx = sibs.findIndex((n) => n.path === selectedPath);
      if (["ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        select(sibs[Math.min(sibs.length - 1, idx + 1)] ?? sibs[0]);
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        select(sibs[Math.max(0, idx - 1)] ?? sibs[0]);
      } else if (e.key === "Enter") {
        const sel = sibs.find((n) => n.path === selectedPath);
        if (sel) open(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, focusNode, selectedPath, goUp, select, open]);

  // Reflect the current view in the URL hash. Drilling (a focus change) pushes a
  // history entry so back/forward step through navigation; selection replaces.
  useEffect(() => {
    if (!model) return;
    const desired = formatHash({ focus: focusPath, selected: selectedPath });
    if (window.location.hash === desired) return;
    if (focusPath !== lastFocus.current) {
      window.history.pushState(null, "", desired);
    } else {
      window.history.replaceState(null, "", desired);
    }
    lastFocus.current = focusPath;
  }, [model, focusPath, selectedPath]);

  // Apply back/forward navigation from the URL.
  useEffect(() => {
    if (!model) return;
    const onPop = () => {
      const state = parseHash();
      if (!state) return;
      if (model.index.has(state.focus)) setFocusPath(state.focus);
      if (model.index.has(state.selected)) setSelectedPath(state.selected);
      lastFocus.current = state.focus;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [model]);

  // Window-level drag & drop of a cdk.out / project directory.
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = await filesFromDataTransfer(e.dataTransfer);
      if (files.length) await openFiles(files);
    },
    [openFiles],
  );

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <TopBar
        label={assembly?.label}
        onSearch={() => setSearchOpen(true)}
        onPickDir={() => dirInputRef.current?.click()}
        onLoadDemo={reloadDemo}
        showTree={showTree}
        showInspector={showInspector}
        onToggleTree={() => setShowTree((v) => !v)}
        onToggleInspector={() => setShowInspector((v) => !v)}
        hasModel={!!model}
      />

      {model && model.warnings.length > 0 && (
        <div className="banner">⚠ {model.warnings.join(" ")}</div>
      )}

      <input
        ref={dirInputRef}
        className="hidden-input"
        type="file"
        multiple
        // Directory selection — attributes set imperatively below.
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void openFiles(files);
          e.target.value = "";
        }}
      />
      <DirAttr inputRef={dirInputRef} />

      {status === "loading" && !model && (
        <div className="welcome">
          <div className="welcome-card">
            <div className="spinner" style={{ margin: "0 auto" }} />
            <p style={{ marginTop: 18 }}>Loading assembly…</p>
          </div>
        </div>
      )}

      {status === "error" && !model && (
        <Welcome
          error={error}
          onPickDir={() => dirInputRef.current?.click()}
          onLoadDemo={reloadDemo}
        />
      )}

      {model && focusNode && selectedNode && (
        <div className="body">
          {showTree && (
            <>
              <TreePanel
                root={model.root}
                selectedPath={selectedPath}
                focusPath={focusPath}
                width={tree.width}
                onSelect={select}
                onOpen={open}
              />
              <Resizer onDragStart={tree.onDragStart} />
            </>
          )}
          <Canvas
            focusNode={focusNode}
            crumbs={ancestry(focusNode)}
            selectedPath={selectedPath}
            viewMode={viewMode}
            onSelect={select}
            onOpen={open}
            onCrumb={(n) => {
              setFocusPath(n.path);
              setSelectedPath(n.path);
            }}
            onViewMode={(m) => {
              setViewMode(m);
              localStorage.setItem("visor.viewMode", m);
            }}
          />
          {showInspector && assembly && (
            <>
              <Resizer onDragStart={inspector.onDragStart} />
              <Inspector
                node={selectedNode}
                model={model}
                sources={assembly.sources}
                width={inspector.width}
                onOpen={open}
              />
            </>
          )}
        </div>
      )}

      {dragging && (
        <div className="overlay" style={{ pointerEvents: "none" }}>
          <div className="welcome-card">
            <h1>Drop to load</h1>
            <p>Release to open this cdk.out / project directory.</p>
          </div>
        </div>
      )}

      {searchOpen && model && (
        <SearchOverlay
          nodes={model.all}
          onClose={() => setSearchOpen(false)}
          onPick={(n) => {
            setSearchOpen(false);
            open(n);
          }}
        />
      )}
    </div>
  );
}

/** Imperatively set the non-standard directory-picker attributes. */
function DirAttr({ inputRef }: { inputRef: React.RefObject<HTMLInputElement> }) {
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, [inputRef]);
  return null;
}
