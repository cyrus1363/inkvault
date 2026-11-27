import { describe, expect, it } from "vitest";
import { replaceAll, splitSentences, wordCount } from "../src/index.js";

describe("text utils", () => {
  it("counts words", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one two\nthree ")).toBe(3);
  });

  it("replaces all occurrences and counts them", () => {
    expect(replaceAll("a b a b a", "a", "c")).toEqual({ content: "c b c b c", count: 3 });
    expect(replaceAll("abc", "", "x")).toEqual({ content: "abc", count: 0 });
    expect(replaceAll("abc", "z", "x")).toEqual({ content: "abc", count: 0 });
  });

  it("splits into sentences on terminal punctuation", () => {
    expect(splitSentences("One two. Three! Really? Yes.")).toEqual(["One two.", "Three!", "Really?", "Yes."]);
    expect(splitSentences("No terminal punctuation")).toEqual(["No terminal punctuation"]);
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("Mr. Smith left. He returned.")).toEqual(["Mr.", "Smith left.", "He returned."]);
  });
});
