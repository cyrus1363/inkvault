import { invoke } from "@tauri-apps/api/core";

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
