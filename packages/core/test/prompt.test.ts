import { describe, expect, it } from "vitest";
import { addDoc, compilePrompt, estimateTokens, type DocNode } from "../src/index.js";

function doc(title: string, content: string): DocNode {
  const { doc: d } = addDoc([], { title, kind: "document" });
  return { ...d, content };
}

describe("compilePrompt", () => {
  it("builds system + user messages with context, active doc, and instruction", () => {
    const context = [doc("Character Sheet", "Name: Ada"), doc("Outline", "Act 1")];
    const active = doc("Ch 1", "The rain started.");
    const compiled = compilePrompt({
      systemPrompt: "Be terse.",
      instruction: "Continue the scene.",
      contextDocs: context,
      activeDoc: active,
    });
    expect(compiled.messages).toHaveLength(2);
    expect(compiled.messages[0]).toEqual({ role: "system", content: "Be terse." });
    const user = compiled.messages[1].content;
    expect(user).toContain('<document title="Character Sheet">');
    expect(user).toContain("Name: Ada");
    expect(user).toContain('<active_document title="Ch 1">');
    expect(user).toContain("The rain started.");
    expect(user).toContain("<instruction>\nContinue the scene.\n</instruction>");
    expect(compiled.includedDocs).toHaveLength(2);
    expect(compiled.estimatedPromptTokens).toBeGreaterThan(10);
  });

  it("escapes XML in titles", () => {
    const compiled = compilePrompt({
      systemPrompt: "",
      instruction: "x",
      contextDocs: [doc('A <b> "quoted"', "body")],
      activeDoc: null,
    });
    expect(compiled.messages).toHaveLength(1);
    expect(compiled.messages[0].content).toContain("A &lt;b&gt; &quot;quoted&quot;");
  });

  it("omits the system message when the system prompt is blank", () => {
    const compiled = compilePrompt({ systemPrompt: "   ", instruction: "i", contextDocs: [], activeDoc: null });
    expect(compiled.messages.map((m) => m.role)).toEqual(["user"]);
  });
});

describe("estimateTokens", () => {
  it("approximates 4 chars per token with a minimum of 1", () => {
    expect(estimateTokens("")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
