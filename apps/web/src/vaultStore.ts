import { createVault, emptyVaultData, openVault, type VaultData } from "@inkvault/core";
import { idbGet, idbSet } from "./idb";

const VAULT_KEY = "vault-file";

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

export async function saveNewVault(name: string, passphrase: string, keyfile?: Uint8Array): Promise<VaultData> {
  const data = emptyVaultData();
  const bytes = await createVault(passphrase, data, keyfile ? { keyfile } : {});
  const stored: StoredVault = {
    name,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    updatedAt: new Date().toISOString(),
  };
  await idbSet(VAULT_KEY, stored);
  setSessionKeys(passphrase, keyfile);
  return data;
}

export async function unlockVault(stored: StoredVault, passphrase: string, keyfile?: Uint8Array): Promise<VaultData> {
  const data = (await openVault(new Uint8Array(stored.bytes), passphrase, keyfile ? { keyfile } : {})) as VaultData;
  setSessionKeys(passphrase, keyfile);
  return data;
}

export async function persistVaultData(stored: StoredVault, data: VaultData): Promise<StoredVault> {
  if (!sessionKeys) {
    throw new Error("Vault is locked");
  }
  const bytes = await createVault(sessionKeys.passphrase, data, sessionKeys.keyfile ? { keyfile: sessionKeys.keyfile } : {});
  const updated: StoredVault = {
    ...stored,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    updatedAt: new Date().toISOString(),
  };
  await idbSet(VAULT_KEY, updated);
  return updated;
}
