/**
 * Reflects the current view (which node is focused and which is selected) in the
 * URL hash so views are shareable and the browser back/forward buttons work.
 */
export interface ViewState {
  focus: string;
  selected: string;
}

export function parseHash(): ViewState | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  if (!params.has("f") && !params.has("s")) return null;
  const focus = params.get("f") ?? "";
  return { focus, selected: params.get("s") ?? focus };
}

export function formatHash(state: ViewState): string {
  const params = new URLSearchParams();
  params.set("f", state.focus);
  params.set("s", state.selected);
  return `#${params.toString()}`;
}
