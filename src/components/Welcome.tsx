export function Welcome({
  error,
  onPickDir,
  onLoadDemo,
}: {
  error?: string;
  onPickDir: () => void;
  onLoadDemo: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <svg viewBox="0 0 32 32" style={{ width: 46, height: 46 }} aria-hidden>
          <rect width="32" height="32" rx="7" fill="#0b1220" />
          <path d="M16 9 L8 22 M16 9 L24 22" stroke="#34507a" strokeWidth="2" />
          <circle cx="16" cy="7" r="3" fill="#4f9cf9" />
          <circle cx="8" cy="24" r="3" fill="#22c79b" />
          <circle cx="24" cy="24" r="3" fill="#f5a623" />
        </svg>
        <h1>cdk-visor</h1>
        <p>
          Explore an AWS CDK app from the root construct down to individual
          CloudFormation resources and source.
        </p>
        {error && (
          <p style={{ color: "var(--bad)" }}>Couldn’t load the demo: {error}</p>
        )}
        <div className="welcome-actions">
          <button className="btn primary" onClick={onPickDir}>
            Open a cdk.out / project directory
          </button>
          <button className="btn" onClick={onLoadDemo}>
            Load the demo app
          </button>
        </div>
        <div className="welcome-hint">
          Tip: run <code>cdk synth</code> in your project, then open the
          generated <code>cdk.out</code> directory. You can also drag &amp; drop
          it anywhere on this window.
        </div>
      </div>
    </div>
  );
}
