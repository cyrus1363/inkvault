import { createVault, emptyVaultData, openVault, type VaultData } from "@inkvault/core";
import { writeToSavedHandle, pickVaultFile } from "./fileVault";
import { isTauri, nativeLoadVault, nativeSaveVault, nativePickPath, defaultVaultPath, vaultFileExists } from "./desktop";
import { idbGet, idbSet } from "./idb";

const VAULT_KEY = "vault-file";
const PATH_KEY = "vault-path";

export interface StoredVault {
  name: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}

interface SessionKeys {
  passphrase: string;
  keyfile?: Uint8Array;
}

let sessionKeys: SessionKeys | null = null;

export function setSessionKeys(passphrase: string, keyfile?: Uint8Array): void {
  sessionKeys = keyfile ? { passphrase, keyfile } : { passphrase };
}

export function clearSessionKeys(): void {
  sessionKeys = null;
}

export async function loadStoredVault(): Promise<StoredVault | undefined> {
  return idbGet<StoredVault>(VAULT_KEY);
}

/**
 * Desktop first-run flow: if no IndexedDB copy exists, open the default vault from
 * the OS app-data dir (created there on first save). Returns undefined on web or
 * when there is no vault anywhere yet.
 */
export async function ensureDesktopVault(): Promise<StoredVault | undefined> {
  if (!isTauri()) return undefined;
  const existing = await idbGet<StoredVault>(VAULT_KEY);
  if (existing) return existing;
  const path = await defaultVaultPath();
  if (!path || !(await vaultFileExists(path))) return undefined;
  const bytes = await nativeLoadVault(path);
  const stored: StoredVault = {
    name: path.split(/[\\/]/).pop()?.replace(/\.vault$/i, "") || "inkvault",
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    updatedAt: new Date().toISOString(),
  };
  await idbSet(VAULT_KEY, stored);
  await setSavedPath(path);
  return stored;
}

export async function getSavedPath(): Promise<string | undefined> {
  return idbGet<string>(PATH_KEY);
}

export async function setSavedPath(path: string): Promise<void> {
  await idbSet(PATH_KEY, path);
}

export async function importVaultFile(): Promise<StoredVault | null> {
  let stored: StoredVault | null = null;
  if (isTauri()) {
    const path = await nativePickPath(false);
    if (!path) return null;
    const bytes = await nativeLoadVault(path);
    stored = {
      name: path.split(/[\\/]/).pop()?.replace(/\.vault$/i, "") ?? "vault",
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      updatedAt: new Date().toISOString(),
    };
    await setSavedPath(path);
  } else {
    stored = await pickVaultFile();
  }
  if (stored) {
    await idbSet(VAULT_KEY, stored);
  }
  return stored;
}

export async function saveVaultToNativePath(name: string, data: VaultData): Promise<string | null> {
  const bytes = await encryptVaultData(data);
  const path = await nativePickPath(true);
  if (!path) return null;
  await nativeSaveVault(path, bytes);
  await setSavedPath(path);
  return path;
}

export async function encryptVaultData(data: VaultData): Promise<Uint8Array> {
  if (!sessionKeys) {
    throw new Error("Vault is locked");
  }
  return createVault(sessionKeys.passphrase, data, sessionKeys.keyfile ? { keyfile: sessionKeys.keyfile } : {});
}

export async function saveNewVault(name: string, passphrase: string, keyfile?: Uint8Array): Promise<VaultData> {
  const data = emptyVaultData();
  const bytes = await createVault(passphrase, data, keyfile ? { keyfile } : {});
  const stored: StoredVault = {
    name,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    updatedAt: new Date().toISOString(),
  };
  await idbSet(VAULT_KEY, stored);
  if (isTauri()) {
    // First run on desktop: default to the app-data dir so the vault survives even
    // if the webview storage is cleared. Best-effort; IndexedDB copy stays authoritative.
    try {
      const path = (await getSavedPath()) ?? (await defaultVaultPath());
      if (path) {
        await nativeSaveVault(path, bytes);
        await setSavedPath(path);
      }
    } catch {
      // ignore — vault is still in IndexedDB; explicit "Save .vault file" works
    }
  }
  setSessionKeys(passphrase, keyfile);
  return data;
}

export async function unlockVault(stored: StoredVault, passphrase: string, keyfile?: Uint8Array): Promise<VaultData> {
  const data = (await openVault(new Uint8Array(stored.bytes), passphrase, keyfile ? { keyfile } : {})) as VaultData;
  setSessionKeys(passphrase, keyfile);
  return data;
}

export async function persistVaultData(stored: StoredVault, data: VaultData): Promise<StoredVault> {
  const bytes = await encryptVaultData(data);
  const updated: StoredVault = {
    ...stored,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    updatedAt: new Date().toISOString(),
  };
  await idbSet(VAULT_KEY, updated);
  await writeToSavedHandle(bytes);
  if (isTauri()) {
    const path = await getSavedPath();
    if (path) {
      try {
        await nativeSaveVault(path, bytes);
      } catch {
        // native write is best-effort; IndexedDB copy is authoritative
      }
    }
  }
  return updated;
}
