import { useEffect, useMemo, useRef, useState } from "react";
import type { VisorNode } from "@/lib/model";
import { search } from "@/lib/search";
import { Badge } from "@/components/Badge";
import { resourceKindOf } from "@/lib/icons";

export function SearchOverlay({
  nodes,
  onClose,
  onPick,
}: {
  nodes: VisorNode[];
  onClose: () => void;
  onPick: (n: VisorNode) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hits = useMemo(() => search(nodes, query), [nodes, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) onPick(hit.node);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="search-box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search by name, path, CloudFormation type, or logical id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="search-results">
          {query && hits.length === 0 && (
            <div className="note">No matching constructs.</div>
          )}
          {hits.map((hit, i) => (
            <div
              key={hit.node.path}
              className={`search-result${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(hit.node)}
            >
              <Badge kind={hit.node.kind} cfnType={hit.node.cfnType} large />
              <div className="sr-main">
                <div className="sr-name">{hit.node.name}</div>
                <div className="sr-path">{hit.node.path || "(root)"}</div>
              </div>
              <div className="sr-type">
                {hit.node.cfnType
                  ? resourceKindOf(hit.node.cfnType)
                  : hit.node.kind}
              </div>
            </div>
          ))}
        </div>
        <div className="search-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
