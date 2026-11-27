import { describe, expect, it } from "vitest";
import { crc32, utf8Decode, utf8Encode, zipStore } from "../src/index.js";

describe("crc32", () => {
  it("matches the known CRC32 of '123456789'", () => {
    expect(crc32(utf8Encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("zipStore", () => {
  it("produces a parseable stored zip with correct names, sizes, and CRC", () => {
    const entries = [
      { name: "a.txt", data: utf8Encode("hello") },
      { name: "dir/b.txt", data: utf8Encode("world!") },
    ];
    const zip = zipStore(entries);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(utf8Decode(zip.slice(30, 30 + 5))).toBe("a.txt");
    expect(view.getUint32(14, true)).toBe(crc32(entries[0].data));
    expect(view.getUint32(18, true)).toBe(5);
    expect(utf8Decode(zip.slice(35, 40))).toBe("hello");
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    expect(view.getUint32(eocd + 12, true)).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
  });
});
