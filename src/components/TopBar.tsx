export function TopBar({
  label,
  onSearch,
  onPickDir,
  onLoadDemo,
  showTree,
  showInspector,
  onToggleTree,
  onToggleInspector,
  hasModel,
}: {
  label?: string;
  onSearch: () => void;
  onPickDir: () => void;
  onLoadDemo: () => void;
  showTree: boolean;
  showInspector: boolean;
  onToggleTree: () => void;
  onToggleInspector: () => void;
  hasModel: boolean;
}) {
  return (
    <div className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="7" fill="#0b1220" />
          <path d="M16 9 L8 22 M16 9 L24 22" stroke="#34507a" strokeWidth="2" />
          <circle cx="16" cy="7" r="3" fill="#4f9cf9" />
          <circle cx="8" cy="24" r="3" fill="#22c79b" />
          <circle cx="24" cy="24" r="3" fill="#f5a623" />
        </svg>
        cdk-visor
        {label && <span className="sub">· {label}</span>}
      </div>

      <div className="spacer" />

      {hasModel && (
        <button className="search-trigger" onClick={onSearch}>
          <span>🔍</span>
          <span>Search constructs…</span>
          <kbd>⌘K</kbd>
        </button>
      )}

      {hasModel && (
        <>
          <button
            className="btn ghost"
            onClick={onToggleTree}
            title="Toggle tree panel"
            aria-pressed={showTree}
          >
            {showTree ? "◧" : "▢"} Tree
          </button>
          <button
            className="btn ghost"
            onClick={onToggleInspector}
            title="Toggle inspector panel"
            aria-pressed={showInspector}
          >
            {showInspector ? "◨" : "▢"} Inspector
          </button>
        </>
      )}

      <button className="btn ghost" onClick={onLoadDemo} title="Reload the demo app">
        Demo
      </button>
      <button className="btn primary" onClick={onPickDir} title="Open a cdk.out or project directory">
        Open project…
      </button>
    </div>
  );
}
