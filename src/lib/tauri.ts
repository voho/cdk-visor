/**
 * Thin integration with the native (Tauri) shell. All Tauri imports are dynamic
 * and guarded by `isTauri()` so the plain web build never touches them at
 * runtime. When running inside the desktop app we use a native folder picker
 * and read the directory in Rust (which avoids WebView file-access limits).
 */
export interface SourceEntry {
  path: string;
  text: string;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Open a native directory picker and read the selected folder's text files via
 * the Rust `read_assembly_dir` command. Returns null if the user cancels.
 */
export async function openDirectoryNative(): Promise<SourceEntry[] | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open a cdk.out or project directory",
  });
  if (typeof selected !== "string") return null;

  return invoke<SourceEntry[]>("read_assembly_dir", { path: selected });
}
