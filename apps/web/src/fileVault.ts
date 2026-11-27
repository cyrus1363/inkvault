import { idbGet, idbSet } from "./idb";
import type { StoredVault } from "./vaultStore";

const HANDLE_KEY = "vault-handle";

type PickerWindow = {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
};

interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export function supportsFileAccess(): boolean {
  const w = window as unknown as PickerWindow;
  return typeof w.showSaveFilePicker === "function" && typeof w.showOpenFilePicker === "function";
}

export async function getSavedHandle(): Promise<FileSystemFileHandle | undefined> {
  try {
    return await idbGet<FileSystemFileHandle>(HANDLE_KEY);
  } catch {
    return undefined;
  }
}

export async function writeToHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = (await (handle as unknown as { createWritable(): Promise<WritableLike> }).createWritable());
  await writable.write(bytes);
  await writable.close();
}

export async function writeToSavedHandle(bytes: Uint8Array): Promise<void> {
  const handle = await getSavedHandle();
  if (!handle) return;
  try {
    await writeToHandle(handle, bytes);
  } catch {
    // permission may have lapsed; the next explicit "Save .vault" re-acquires it
  }
}

export async function attachVaultFile(name: string, bytes: Uint8Array): Promise<FileSystemFileHandle | null> {
  const w = window as unknown as PickerWindow;
  if (!w.showSaveFilePicker) return null;
  const handle = await w.showSaveFilePicker({
    suggestedName: name.endsWith(".vault") ? name : `${name}.vault`,
  });
  await writeToHandle(handle, bytes);
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function pickVaultFile(): Promise<StoredVault | null> {
  const w = window as unknown as PickerWindow;
  if (!w.showOpenFilePicker) return null;
  const handles = await w.showOpenFilePicker({ multiple: false });
  const handle = handles[0];
  if (!handle) return null;
  const file = await handle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name: file.name.replace(/\.vault$/i, ""),
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    updatedAt: new Date().toISOString(),
  };
}
