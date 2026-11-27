import { Channel, invoke } from "@tauri-apps/api/core";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function nativeSaveVault(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("vault_write", { path, bytes: Array.from(bytes) });
}

export async function nativeLoadVault(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("vault_read", { path });
  return new Uint8Array(bytes);
}

export async function nativePickPath(save: boolean): Promise<string | null> {
  return invoke<string | null>("pick_vault_path", { save });
}

/** Default vault path in the OS app-data dir (desktop only). */
export async function defaultVaultPath(): Promise<string> {
  return invoke<string>("default_vault_path");
}

export async function vaultFileExists(path: string): Promise<boolean> {
  return invoke<boolean>("vault_exists", { path });
}

/** Default models dir (app-data/models) for GGUF downloads. */
export async function defaultModelsDir(): Promise<string> {
  return invoke<string>("default_models_dir");
}

export interface DownloadProgress {
  status: "downloading" | "done" | "error" | "cancelled";
  downloaded: number;
  total?: number;
  message?: string;
}

export interface ActiveDownload {
  id: string;
  url: string;
  dest: string;
}

/** Start a resumable download in the background; progress arrives via callback. */
export async function downloadModel(
  id: string,
  url: string,
  dest: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  const channel = new Channel<DownloadProgress>();
  channel.onmessage = onProgress;
  await invoke("download_model", { id, url, dest, onProgress: channel });
}

export async function cancelDownload(id: string): Promise<void> {
  await invoke("cancel_download", { id });
}

// --- plain-Markdown folder mode ---

export interface FolderEntry {
  name: string;
  isDir: boolean;
}

export async function pickFolderPath(): Promise<string | null> {
  return invoke<string | null>("pick_folder_path");
}

export async function folderList(path: string): Promise<FolderEntry[]> {
  return invoke<FolderEntry[]>("folder_list", { path });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke("write_text_file", { path, contents });
}

export async function startLocalServer(bin: string, model: string, port: number, host: string): Promise<void> {
  await invoke("start_local_server", { bin, model, port, host });
}

export async function stopLocalServer(): Promise<void> {
  await invoke("stop_local_server");
}

export async function localServerRunning(): Promise<boolean> {
  return invoke<boolean>("server_running");
}

export interface DesktopConfig {
  bin: string;
  modelPath: string;
  port: number;
  host: string;
  /** Optional plain-Markdown mirror folder (Dropbox-friendly, unencrypted by design). */
  mdFolder?: string;
  mdSync?: boolean;
}

const CFG_KEY = "inkvault-desktop-config";

const DEFAULT_CONFIG: DesktopConfig = { bin: "", modelPath: "", port: 8080, host: "127.0.0.1" };

export function getDesktopConfig(): DesktopConfig {
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(CFG_KEY) ?? "{}") as Partial<DesktopConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setDesktopConfig(config: DesktopConfig): void {
  localStorage.setItem(CFG_KEY, JSON.stringify(config));
}
