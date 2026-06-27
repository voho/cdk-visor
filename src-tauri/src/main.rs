// Hide the extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
struct FileEntry {
    /// Path relative to the selected directory, using forward slashes.
    path: String,
    text: String,
}

const MAX_FILES: usize = 20_000;
const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Recursively read the text files in a directory the user picked, so the
/// frontend can assemble the model. Binary and oversized files are skipped, as
/// are heavy directories like `node_modules` and `.git`.
#[tauri::command]
fn read_assembly_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let root = PathBuf::from(&path);
    let mut out = Vec::new();
    walk(&root, &root, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<FileEntry>) -> std::io::Result<()> {
    if out.len() >= MAX_FILES {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_dir() {
            if name == "node_modules" || name == ".git" {
                continue;
            }
            walk(root, &path, out)?;
        } else if file_type.is_file() {
            if entry.metadata()?.len() > MAX_FILE_BYTES {
                continue;
            }
            // read_to_string fails on non-UTF-8 (binary) files, which we skip.
            if let Ok(text) = std::fs::read_to_string(&path) {
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push(FileEntry { path: rel, text });
            }
        }

        if out.len() >= MAX_FILES {
            break;
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_assembly_dir])
        .run(tauri::generate_context!())
        .expect("error while running cdk-visor");
}
