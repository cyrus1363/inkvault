use std::fs;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;

static LOCAL_SERVER: Mutex<Option<Child>> = Mutex::new(None);

#[tauri::command]
fn vault_write(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(Path::new(&path), &bytes).map_err(|e| format!("vault_write failed: {e}"))
}

#[tauri::command]
fn vault_read(path: String) -> Result<Vec<u8>, String> {
    fs::read(Path::new(&path)).map_err(|e| format!("vault_read failed: {e}"))
}

#[tauri::command]
fn pick_vault_path(save: bool) -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new().add_filter("inkvault vault", &["vault"]);
    let picked = if save {
        dialog.set_file_name("vault.vault").save_file()
    } else {
        dialog.pick_file()
    };
    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}

/// Default vault location in the OS app-data dir (e.g. %APPDATA%/ai.inkvault.desktop on Windows).
/// The directory is created if missing; the vault file itself is created on first save.
#[tauri::command]
fn default_vault_path(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all failed: {e}"))?;
    Ok(dir.join("inkvault.vault").to_string_lossy().into_owned())
}

#[tauri::command]
fn vault_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

#[tauri::command]
fn start_local_server(bin: String, model: String, port: u16, host: String) -> Result<(), String> {
    let mut guard = LOCAL_SERVER.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }
    let child = Command::new(&bin)
        .arg("--model")
        .arg(&model)
        .arg("--port")
        .arg(port.to_string())
        .arg("--host")
        .arg(&host)
        .arg("--ctx-size")
        .arg("32768")
        .spawn()
        .map_err(|e| format!("failed to spawn {bin}: {e}"))?;
    *guard = Some(child);
    Ok(())
}

#[tauri::command]
fn stop_local_server() -> Result<(), String> {
    let mut guard = LOCAL_SERVER.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
fn server_running() -> bool {
    LOCAL_SERVER.lock().map(|g| g.is_some()).unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Model download manager (GGUF etc.): progress + resume via HTTP Range.
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    status: String, // "downloading" | "done" | "error" | "cancelled"
    downloaded: u64,
    total: Option<u64>,
    message: Option<String>,
}

static DOWNLOADS: Mutex<Option<std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>>>
    = Mutex::new(None);

/// Default models dir in the OS app-data dir (e.g. %APPDATA%/ai.inkvault.desktop/models).
#[tauri::command]
fn default_models_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {e}"))?
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all failed: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Start a download in a background thread and return immediately.
/// Progress is reported on the channel; resume uses a "<dest>.part" file plus
/// an HTTP Range request when the server supports it (206), otherwise restarts.
#[tauri::command]
fn download_model(
    id: String,
    url: String,
    dest: String,
    on_progress: tauri::ipc::Channel<DownloadProgress>,
) -> Result<(), String> {
    use std::collections::HashMap;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    let mut guard = DOWNLOADS.lock().map_err(|e| e.to_string())?;
    let map = guard.get_or_insert_with(HashMap::new);
    if map.contains_key(&id) {
        return Err("a download with this id is already running".into());
    }
    let flag = Arc::new(AtomicBool::new(false));
    map.insert(id.clone(), flag.clone());
    drop(guard);
    std::thread::spawn(move || run_download(id, url, dest, flag, on_progress));
    Ok(())
}

#[tauri::command]
fn cancel_download(id: String) -> Result<(), String> {
    if let Ok(guard) = DOWNLOADS.lock() {
        if let Some(flag) = guard.as_ref().and_then(|m| m.get(&id)) {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Plain-Markdown folder mode (opt-in, desktop): generic file commands used by
// the web layer to mirror documents as .md files in a user-picked folder.
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderEntry {
    name: String,
    is_dir: bool,
}

#[tauri::command]
fn pick_folder_path() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn folder_list(path: String) -> Result<Vec<FolderEntry>, String> {
    let mut entries: Vec<FolderEntry> = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| format!("read_dir failed: {e}"))? {
        let entry = entry.map_err(|e| format!("read_dir entry failed: {e}"))?;
        entries.push(FolderEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: entry.path().is_dir(),
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(Path::new(&path)).map_err(|e| format!("read failed: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create_dir_all failed: {e}"))?;
    }
    fs::write(p, contents).map_err(|e| format!("write failed: {e}"))
}

fn run_download(
    id: String,
    url: String,
    dest: String,
    cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    ch: tauri::ipc::Channel<DownloadProgress>,
) {
    use std::io::{Read, Seek, SeekFrom, Write};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    let cleanup = |id: &str| {
        if let Ok(mut guard) = DOWNLOADS.lock() {
            if let Some(map) = guard.as_mut() {
                map.remove(id);
            }
        }
    };
    let send = |status: &str, downloaded: u64, total: Option<u64>, message: Option<String>| {
        let _ = ch.send(DownloadProgress {
            status: status.to_string(),
            downloaded,
            total,
            message,
        });
    };
    let finish = |status: &str, downloaded: u64, total: Option<u64>, message: Option<String>, id: &str| {
        send(status, downloaded, total, message);
        cleanup(id);
    };

    if Path::new(&dest).is_file() {
        // already downloaded — report as done (idempotent re-run)
        let len = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        finish("done", len, Some(len), None, &id);
        return;
    }

    let part = format!("{dest}.part");
    let mut have: u64 = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let mut file = match fs::OpenOptions::new().create(true).read(true).write(true).open(&part) {
        Ok(f) => f,
        Err(e) => {
            finish("error", 0, None, Some(format!("cannot open {part}: {e}")), &id);
            return;
        }
    };
    if let Err(e) = file.seek(SeekFrom::End(0)) {
        finish("error", have, None, Some(format!("seek failed: {e}")), &id);
        return;
    }

    let request = if have > 0 {
        ureq::get(&url).set("Range", &format!("bytes={have}-"))
    } else {
        ureq::get(&url)
    };
    let resp = match request.call() {
        Ok(r) => r,
        Err(ureq::Error::Status(416, _)) if have > 0 => {
            // range not satisfiable — the .part file is likely already complete
            match fs::rename(&part, &dest) {
                Ok(()) => finish("done", have, Some(have), None, &id),
                Err(e) => finish("error", have, None, Some(format!("rename failed: {e}")), &id),
            }
            return;
        }
        Err(ureq::Error::Status(code, _)) => {
            finish("error", have, None, Some(format!("HTTP {code} from server")), &id);
            return;
        }
        Err(e) => {
            finish("error", have, None, Some(format!("request failed: {e}")), &id);
            return;
        }
    };

    let status = resp.status();
    let content_length: u64 = resp
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let total = if have > 0 && status == 206 {
        (have + content_length).max(have)
    } else if have > 0 {
        // server ignored the Range header — restart from scratch
        have = 0;
        if let Err(e) = file.set_len(0).and_then(|_| file.seek(SeekFrom::Start(0))) {
            finish("error", 0, None, Some(format!("restart failed: {e}")), &id);
            return;
        }
        content_length.max(0)
    } else {
        content_length
    };
    let total = if total > 0 { Some(total) } else { None };

    send("downloading", have, total, None);
    let mut reader = resp.into_reader();
    let mut buf = vec![0u8; 256 * 1024];
    let mut last_report = Instant::now();
    loop {
        if cancel.load(Ordering::Relaxed) {
            finish("cancelled", have, total, None, &id);
            return;
        }
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => {
                finish("error", have, total, Some(format!("read failed: {e}")), &id);
                return;
            }
        };
        if let Err(e) = file.write_all(&buf[..n]) {
            finish("error", have, total, Some(format!("write failed: {e}")), &id);
            return;
        }
        have += n as u64;
        if last_report.elapsed() >= Duration::from_millis(400) {
            last_report = Instant::now();
            send("downloading", have, total, None);
        }
    }
    match fs::rename(&part, &dest) {
        Ok(()) => finish("done", have, total.or(Some(have)), None, &id),
        Err(e) => finish("error", have, total, Some(format!("rename failed: {e}")), &id),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            vault_write,
            vault_read,
            vault_exists,
            default_vault_path,
            default_models_dir,
            pick_vault_path,
            start_local_server,
            stop_local_server,
            server_running,
            download_model,
            cancel_download,
            pick_folder_path,
            folder_list,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running inkvault");
}
