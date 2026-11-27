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
        dialog.open_file()
    };
    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            vault_write,
            vault_read,
            pick_vault_path,
            start_local_server,
            stop_local_server,
            server_running
        ])
        .run(tauri::generate_context!())
        .expect("error while running inkvault");
}
