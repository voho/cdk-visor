import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadDemo,
  loadFromFiles,
  type LoadedAssembly,
} from "@/lib/loader";
import { ancestry, type VisorNode } from "@/lib/model";
import { TopBar } from "@/components/TopBar";
import { TreePanel } from "@/components/TreePanel";
import { Canvas } from "@/components/Canvas";
import { Inspector } from "@/components/Inspector";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Welcome } from "@/components/Welcome";
import { filesFromDataTransfer } from "@/lib/dnd";

type Status = "loading" | "ready" | "error";

export default function App() {
  const [assembly, setAssembly] = useState<LoadedAssembly | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>("");

  const [focusPath, setFocusPath] = useState<string>("");
  const [selectedPath, setSelectedPath] = useState<string>("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [dragging, setDragging] = useState(false);

  const dirInputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback((next: LoadedAssembly) => {
    setAssembly(next);
    setStatus("ready");
    setError("");
    setFocusPath(next.model.root.path);
    setSelectedPath(next.model.root.path);
  }, []);

  // Auto-load the bundled demo on first paint.
  useEffect(() => {
    let alive = true;
    loadDemo()
      .then((a) => {
        if (alive) ingest(a);
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
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

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
        onLoadDemo={async () => {
          setStatus("loading");
          try {
            ingest(await loadDemo());
          } catch (e) {
            setStatus("error");
            setError(String((e as Error)?.message ?? e));
          }
        }}
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
          onLoadDemo={async () => {
            setStatus("loading");
            try {
              ingest(await loadDemo());
            } catch (e) {
              setStatus("error");
              setError(String((e as Error)?.message ?? e));
            }
          }}
        />
      )}

      {model && focusNode && selectedNode && (
        <div className="body">
          {showTree && (
            <TreePanel
              root={model.root}
              selectedPath={selectedPath}
              focusPath={focusPath}
              onSelect={select}
              onOpen={open}
            />
          )}
          <Canvas
            focusNode={focusNode}
            crumbs={ancestry(focusNode)}
            selectedPath={selectedPath}
            onSelect={select}
            onOpen={open}
            onCrumb={(n) => {
              setFocusPath(n.path);
              setSelectedPath(n.path);
            }}
          />
          {showInspector && assembly && (
            <Inspector
              node={selectedNode}
              model={model}
              sources={assembly.sources}
              onOpen={open}
            />
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
