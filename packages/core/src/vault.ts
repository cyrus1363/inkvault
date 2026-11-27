import {
  concatBytes,
  fromBase64,
  randomBytes,
  sha256,
  toArrayBuffer,
  toBase64,
  utf8Decode,
  utf8Encode,
} from "./crypto.js";
import { VaultError } from "./errors.js";

export const VAULT_MAGIC = "VLTW";
export const VAULT_VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const DEK_LENGTH = 32;

const HEADER_FIXED_LENGTH = 4 + 2 + 4;

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
}

export interface VaultHeader {
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  hasKeyfile: boolean;
  wrap: { alg: "AES-256-GCM"; iv: string; wrappedDek: string };
  content: { alg: "AES-256-GCM"; iv: string };
}

export interface CreateVaultOptions {
  keyfile?: Uint8Array;
  iterations?: number;
}

export interface OpenVaultOptions {
  keyfile?: Uint8Array;
}

export interface VaultPeek {
  version: number;
  kdf: string;
  iterations: number;
  hasKeyfile: boolean;
}

function isVaultHeader(value: unknown): value is VaultHeader {
  if (typeof value !== "object" || value === null) return false;
  const h = value as Record<string, unknown>;
  const wrap = h.wrap as Record<string, unknown> | undefined;
  const content = h.content as Record<string, unknown> | undefined;
  return (
    h.kdf === "PBKDF2-SHA-256" &&
    typeof h.iterations === "number" &&
    Number.isFinite(h.iterations) &&
    h.iterations > 0 &&
    typeof h.salt === "string" &&
    typeof h.hasKeyfile === "boolean" &&
    !!wrap &&
    wrap.alg === "AES-256-GCM" &&
    typeof wrap.iv === "string" &&
    typeof wrap.wrappedDek === "string" &&
    !!content &&
    content.alg === "AES-256-GCM" &&
    typeof content.iv === "string"
  );
}

function readContainer(bytes: Uint8Array): { header: VaultHeader; ciphertext: Uint8Array } {
  if (bytes.length < HEADER_FIXED_LENGTH) {
    throw new VaultError("truncated", "File is too small to be a vault");
  }
  if (utf8Decode(bytes.slice(0, 4)) !== VAULT_MAGIC) {
    throw new VaultError("bad-magic", "Not a vault file (bad magic bytes)");
  }
  const view = viewOf(bytes);
  const version = view.getUint16(4, true);
  if (version !== VAULT_VERSION) {
    throw new VaultError("unsupported-version", `Unsupported vault version ${version}`);
  }
  const headerLength = view.getUint32(6, true);
  const headerEnd = HEADER_FIXED_LENGTH + headerLength;
  if (bytes.length < headerEnd) {
    throw new VaultError("truncated", "Truncated vault header");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(bytes.slice(HEADER_FIXED_LENGTH, headerEnd)));
  } catch {
    throw new VaultError("bad-header", "Vault header is not valid JSON");
  }
  if (!isVaultHeader(parsed)) {
    throw new VaultError("bad-header", "Malformed vault header");
  }
  return { header: parsed, ciphertext: bytes.slice(headerEnd) };
}

async function compositeKeyMaterial(passphrase: string, keyfile?: Uint8Array): Promise<Uint8Array> {
  const passBytes = utf8Encode(passphrase);
  if (!keyfile || keyfile.length === 0) return passBytes;
  return sha256(concatBytes(passBytes, keyfile));
}

async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  keyfile?: Uint8Array,
): Promise<CryptoKey> {
  const material = await compositeKeyMaterial(passphrase, keyfile);
  const baseKey = await crypto.subtle.importKey("raw", toArrayBuffer(material), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export async function createVault(
  passphrase: string,
  data: unknown,
  options: CreateVaultOptions = {},
): Promise<Uint8Array> {
  if (!passphrase) {
    throw new VaultError("bad-argument", "Passphrase must not be empty");
  }
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const salt = randomBytes(SALT_LENGTH);
  const dek = randomBytes(DEK_LENGTH);
  const wrapKey = await deriveWrapKey(passphrase, salt, iterations, options.keyfile);
  const dekKey = await crypto.subtle.importKey("raw", toArrayBuffer(dek), { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
  ]);
  const wrapIv = randomBytes(IV_LENGTH);
  const wrappedDek = new Uint8Array(
    await crypto.subtle.wrapKey("raw", dekKey, wrapKey, { name: "AES-GCM", iv: toArrayBuffer(wrapIv) }),
  );
  const contentIv = randomBytes(IV_LENGTH);
  const plaintext = utf8Encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(contentIv) }, dekKey, toArrayBuffer(plaintext)),
  );
  const header: VaultHeader = {
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: toBase64(salt),
    hasKeyfile: !!options.keyfile && options.keyfile.length > 0,
    wrap: { alg: "AES-256-GCM", iv: toBase64(wrapIv), wrappedDek: toBase64(wrappedDek) },
    content: { alg: "AES-256-GCM", iv: toBase64(contentIv) },
  };
  const headerBytes = utf8Encode(JSON.stringify(header));
  const out = new Uint8Array(HEADER_FIXED_LENGTH + headerBytes.length + ciphertext.length);
  const view = viewOf(out);
  out.set(utf8Encode(VAULT_MAGIC), 0);
  view.setUint16(4, VAULT_VERSION, true);
  view.setUint32(6, headerBytes.length, true);
  out.set(headerBytes, HEADER_FIXED_LENGTH);
  out.set(ciphertext, HEADER_FIXED_LENGTH + headerBytes.length);
  return out;
}

export async function openVault(
  bytes: Uint8Array,
  passphrase: string,
  options: OpenVaultOptions = {},
): Promise<unknown> {
  if (!passphrase) {
    throw new VaultError("bad-argument", "Passphrase must not be empty");
  }
  const { header, ciphertext } = readContainer(bytes);
  if (header.hasKeyfile && (!options.keyfile || options.keyfile.length === 0)) {
    throw new VaultError("auth-failed", "This vault requires a keyfile");
  }
  let salt: Uint8Array;
  let wrapIv: Uint8Array;
  let wrappedDek: Uint8Array;
  let contentIv: Uint8Array;
  try {
    salt = fromBase64(header.salt);
    wrapIv = fromBase64(header.wrap.iv);
    wrappedDek = fromBase64(header.wrap.wrappedDek);
    contentIv = fromBase64(header.content.iv);
  } catch {
    throw new VaultError("bad-header", "Malformed base64 in vault header");
  }
  const wrapKey = await deriveWrapKey(passphrase, salt, header.iterations, options.keyfile);
  let dekKey: CryptoKey;
  try {
    dekKey = await crypto.subtle.unwrapKey(
      "raw",
      toArrayBuffer(wrappedDek),
      wrapKey,
      { name: "AES-GCM", iv: toArrayBuffer(wrapIv) },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new VaultError("auth-failed", "Wrong passphrase or keyfile");
  }
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(contentIv) },
      dekKey,
      toArrayBuffer(ciphertext),
    );
  } catch {
    throw new VaultError("corrupt", "Vault content failed the integrity check");
  }
  try {
    return JSON.parse(utf8Decode(new Uint8Array(plaintext)));
  } catch {
    throw new VaultError("corrupt", "Vault content is not valid JSON");
  }
}

export function peekVault(bytes: Uint8Array): VaultPeek {
  const { header } = readContainer(bytes);
  return {
    version: VAULT_VERSION,
    kdf: header.kdf,
    iterations: header.iterations,
    hasKeyfile: header.hasKeyfile,
  };
}
