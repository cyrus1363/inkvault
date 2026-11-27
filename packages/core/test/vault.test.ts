import { describe, expect, it } from "vitest";
import {
  createVault,
  DEFAULT_ITERATIONS,
  emptyVaultData,
  openVault,
  peekVault,
  VAULT_MAGIC,
  VAULT_VERSION,
  VaultError,
} from "../src/index.js";

const FAST = { iterations: 1_000 };
const PASSPHRASE = "correct horse battery staple";

describe("vault round trip", () => {
  it("creates and opens a vault with the correct passphrase", async () => {
    const data = { ...emptyVaultData(), hello: "wörld ✓", nested: { n: [1, 2, 3] } };
    const bytes = await createVault(PASSPHRASE, data, FAST);
    expect(bytes.length).toBeGreaterThan(64);
    const opened = await openVault(bytes, PASSPHRASE);
    expect(opened).toEqual(data);
  });

  it("produces the expected binary layout", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, FAST);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe(VAULT_MAGIC);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(4, true)).toBe(VAULT_VERSION);
    expect(view.getUint32(6, true)).toBeGreaterThan(0);
  });

  it("uses a fresh random salt per vault", async () => {
    const a = await createVault(PASSPHRASE, { x: 1 }, FAST);
    const b = await createVault(PASSPHRASE, { x: 1 }, FAST);
    expect(peekVault(a).iterations).toBe(1_000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe("authentication and integrity", () => {
  it("rejects a wrong passphrase", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, FAST);
    await expect(openVault(bytes, "wrong passphrase")).rejects.toMatchObject({
      name: "VaultError",
      code: "auth-failed",
    });
  });

  it("rejects an empty passphrase on create and open", async () => {
    await expect(createVault("", {}, FAST)).rejects.toBeInstanceOf(VaultError);
    const bytes = await createVault(PASSPHRASE, {}, FAST);
    await expect(openVault(bytes, "")).rejects.toMatchObject({ code: "bad-argument" });
  });

  it("rejects a corrupted ciphertext", async () => {
    const bytes = await createVault(PASSPHRASE, { secret: "manuscript" }, FAST);
    bytes[bytes.length - 1] ^= 0xff;
    await expect(openVault(bytes, PASSPHRASE)).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects a truncated ciphertext", async () => {
    const bytes = await createVault(PASSPHRASE, { secret: "manuscript" }, FAST);
    const cut = bytes.slice(0, bytes.length - 16);
    await expect(openVault(cut, PASSPHRASE)).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects a bad magic", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, FAST);
    bytes[0] = 0x00;
    await expect(openVault(bytes, PASSPHRASE)).rejects.toMatchObject({ code: "bad-magic" });
  });

  it("rejects a truncated file", async () => {
    await expect(openVault(new Uint8Array(4), PASSPHRASE)).rejects.toMatchObject({ code: "truncated" });
  });

  it("rejects a corrupted header", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, FAST);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLen = view.getUint32(6, true);
    bytes[10 + Math.floor(headerLen / 2)] ^= 0xff;
    await expect(openVault(bytes, PASSPHRASE)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof VaultError && (err.code === "bad-header" || err.code === "auth-failed" || err.code === "corrupt"),
    );
  });
});

describe("keyfile (paranoid mode)", () => {
  const keyfile = new TextEncoder().encode("keyfile-contents-123");
  const wrongKeyfile = new TextEncoder().encode("wrong-keyfile");

  it("requires the keyfile when the vault was created with one", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, { ...FAST, keyfile });
    expect(peekVault(bytes).hasKeyfile).toBe(true);
    await expect(openVault(bytes, PASSPHRASE)).rejects.toMatchObject({ code: "auth-failed" });
    await expect(openVault(bytes, PASSPHRASE, { keyfile: wrongKeyfile })).rejects.toMatchObject({
      code: "auth-failed",
    });
    const opened = await openVault(bytes, PASSPHRASE, { keyfile });
    expect(opened).toEqual({ a: 1 });
  });

  it("reports hasKeyfile=false without a keyfile", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, FAST);
    expect(peekVault(bytes).hasKeyfile).toBe(false);
  });
});

describe("peek and defaults", () => {
  it("peeks header metadata without a passphrase", async () => {
    const bytes = await createVault(PASSPHRASE, { a: 1 }, FAST);
    expect(peekVault(bytes)).toEqual({
      version: VAULT_VERSION,
      kdf: "PBKDF2-SHA-256",
      iterations: 1_000,
      hasKeyfile: false,
    });
  });

  it("defaults to 600k PBKDF2 iterations", () => {
    expect(DEFAULT_ITERATIONS).toBe(600_000);
  });

  it("writes and honors the real default parameters", async () => {
    const bytes = await createVault(PASSPHRASE, { real: true });
    expect(peekVault(bytes).iterations).toBe(DEFAULT_ITERATIONS);
    const opened = await openVault(bytes, PASSPHRASE);
    expect(opened).toEqual({ real: true });
  }, 30_000);
});
