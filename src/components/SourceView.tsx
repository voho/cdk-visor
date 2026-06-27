import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceProvider, ResolvedSource } from "@/lib/loader";
import type { TraceFrame, VisorNode } from "@/lib/model";
import { highlightTsLine } from "@/lib/highlight";
import { docsUrlFor } from "@/lib/docs";

export function SourceView({
  node,
  sources,
}: {
  node: VisorNode;
  sources: SourceProvider;
}) {
  // Prefer frames that point at user code over node_modules / aws-cdk-lib.
  const frames = useMemo(() => orderFrames(node.traces), [node.traces]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [resolved, setResolved] = useState<ResolvedSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  const active = frames[activeIdx];

  useEffect(() => {
    setActiveIdx(0);
  }, [node.path]);

  useEffect(() => {
    let alive = true;
    if (!active?.file) {
      setResolved(null);
      return;
    }
    setLoading(true);
    setMissing(false);
    sources
      .resolve(active.file)
      .then((r) => {
        if (!alive) return;
        setResolved(r);
        setMissing(!r);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [active, sources]);

  if (frames.length === 0) {
    return (
      <div className="note">
        No source trace was captured for this construct.
        <p style={{ color: "var(--text-faint)", marginTop: 10 }}>
          Re-synthesize with traces enabled to map constructs back to source:
        </p>
        <pre className="code" style={{ background: "var(--bg-elev)" }}>
          CDK_DEBUG=true cdk synth
        </pre>
        <DocsLink node={node} />
      </div>
    );
  }

  return (
    <div className="source">
      <div className="trace-list">
        {frames.map((f, i) => (
          <div
            key={i}
            className={`trace-frame${i === activeIdx ? " selected" : ""}`}
            onClick={() => setActiveIdx(i)}
            style={
              i === activeIdx
                ? { background: "var(--accent-soft)" }
                : undefined
            }
          >
            <span className="sym">{f.symbol ?? "(anonymous)"}</span>
            <span className="loc">
              {f.file ? shorten(f.file) : f.raw}
              {f.line ? `:${f.line}` : ""}
            </span>
          </div>
        ))}
      </div>

      {loading && <div className="note">Loading source…</div>}
      {missing && active?.file && (
        <div className="note">
          Could not load <code>{shorten(active.file)}</code>. Open the project
          directory (including sources) to view it inline.
        </div>
      )}
      {resolved && (
        <CodeFile
          path={resolved.path}
          content={resolved.content}
          highlightLine={active?.line}
        />
      )}
    </div>
  );
}

function CodeFile({
  path,
  content,
  highlightLine,
}: {
  path: string;
  content: string;
  highlightLine?: number;
}) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const hlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hlRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [path, highlightLine]);

  return (
    <>
      <div className="source-file">
        <span>📄</span>
        <span className="file-name">{shorten(path)}</span>
      </div>
      <div className="codelines">
        {lines.map((line, i) => {
          const n = i + 1;
          const hl = n === highlightLine;
          return (
            <div
              key={n}
              ref={hl ? hlRef : undefined}
              className={`codeline${hl ? " hl" : ""}`}
            >
              <span className="ln">{n}</span>
              <span
                className="lc"
                dangerouslySetInnerHTML={{ __html: highlightTsLine(line) || "&nbsp;" }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

function DocsLink({ node }: { node: VisorNode }) {
  const url = docsUrlFor(node.constructInfo?.fqn);
  if (!url) return null;
  return (
    <p style={{ marginTop: 14 }}>
      Reference:{" "}
      <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
        {node.constructInfo?.fqn} ↗
      </a>
    </p>
  );
}

/** Rank user code above library frames so the most relevant file shows first. */
function orderFrames(frames: TraceFrame[]): TraceFrame[] {
  const isLib = (f: TraceFrame) =>
    /node_modules|aws-cdk-lib|constructs\/lib|internal\//.test(f.file ?? "");
  return [...frames].sort((a, b) => Number(isLib(a)) - Number(isLib(b)));
}

function shorten(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts.length > 4 ? "…/" + parts.slice(-3).join("/") : p;
}
