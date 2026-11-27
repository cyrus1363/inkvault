import { describe, expect, it } from "vitest";
import { fromBase64, generateKeyfile, randomBytes, toBase64 } from "../src/index.js";

describe("crypto helpers", () => {
  it("generateKeyfile returns 32 fresh random bytes each time", () => {
    const a = generateKeyfile();
    const b = generateKeyfile();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("base64 round-trips binary data", () => {
    const data = randomBytes(64);
    expect(Buffer.from(fromBase64(toBase64(data))).equals(Buffer.from(data))).toBe(true);
  });
});
