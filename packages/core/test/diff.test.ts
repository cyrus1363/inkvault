import { describe, expect, it } from "vitest";
import { applyHunks, diffText, hunkText } from "../src/index.js";

describe("diffText", () => {
  it("returns no hunks for identical text", () => {
    expect(diffText("a\nb", "a\nb")).toEqual([]);
  });

  it("detects a single changed line in the middle", () => {
    const hunks = diffText("one\ntwo\nthree", "one\nTWO\nthree");
    expect(hunks.map((h) => h.type)).toEqual(["keep", "del", "add", "keep"]);
    expect(hunkText(hunks[1])).toBe("two");
    expect(hunkText(hunks[2])).toBe("TWO");
  });

  it("handles append and delete at the end", () => {
    expect(diffText("a", "a\nb").map((h) => h.type)).toEqual(["keep", "add"]);
    expect(diffText("a\nb", "a").map((h) => h.type)).toEqual(["keep", "del"]);
  });

  it("handles completely different texts", () => {
    const hunks = diffText("x\ny", "p\nq\nr");
    expect(hunks.map((h) => h.type)).toEqual(["del", "add"]);
  });
});

describe("applyHunks", () => {
  const hunks = diffText("one\ntwo\nthree", "one\nTWO\nthree\nfour");

  it("accepting all change hunks yields the new text", () => {
    expect(applyHunks(hunks, () => true)).toBe("one\nTWO\nthree\nfour");
  });

  it("rejecting all change hunks yields the original text", () => {
    expect(applyHunks(hunks, () => false)).toBe("one\ntwo\nthree");
  });

  it("accepting only add hunks keeps the deleted line and applies the additions", () => {
    const result = applyHunks(hunks, (i) => hunks[i].type === "add");
    expect(result).toBe("one\ntwo\nTWO\nthree\nfour");
  });
});
