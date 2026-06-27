/**
 * Extract a flat list of File objects from a drop event, recursing into any
 * dropped directories via the (non-standard but widely supported)
 * `webkitGetAsEntry` filesystem API.
 */

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
}

function readEntryFile(entry: FsEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file?.(
      (f) => resolve(f),
      () => resolve(null),
    );
  });
}

function readDirEntries(entry: FsEntry): Promise<FsEntry[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader?.();
    if (!reader) return resolve([]);
    const out: FsEntry[] = [];
    const pump = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) return resolve(out);
          out.push(...entries);
          pump();
        },
        () => resolve(out),
      );
    };
    pump();
  });
}

async function walk(entry: FsEntry, acc: File[]): Promise<void> {
  if (entry.isFile) {
    const f = await readEntryFile(entry);
    if (f) acc.push(f);
  } else if (entry.isDirectory) {
    const entries = await readDirEntries(entry);
    for (const child of entries) await walk(child, acc);
  }
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map(
      (it) =>
        (it.webkitGetAsEntry?.() ?? null) as unknown as FsEntry | null,
    )
    .filter((e): e is FsEntry => !!e);

  if (entries.length === 0) {
    // No filesystem entries available — fall back to the flat file list.
    return Array.from(dt.files ?? []);
  }

  const out: File[] = [];
  for (const entry of entries) await walk(entry, out);
  return out;
}
