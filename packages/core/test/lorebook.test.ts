import { describe, expect, it } from "vitest";
import { addDoc, findAutoContext, updateDoc } from "../src/index.js";

function doc(title: string, aliases: string[] = []) {
  const { doc: d } = addDoc([], { title, kind: "document" });
  return { ...d, loreAliases: aliases, contextEnabled: false };
}

describe("findAutoContext", () => {
  it("auto-includes docs whose title or alias appears in the active text", () => {
    const ada = doc("Ada Lovelace", ["Ada", "Countess"]);
    const bob = doc("Bob", []);
    const scene = doc("Ch 1");
    const docs = [ada, bob, scene];
    const found = findAutoContext(docs, scene.id, "Ada smiled at the Countess.");
    expect(found.map((d) => d.id)).toEqual([ada.id]);
  });

  it("ignores docs already context-enabled and the active doc itself", () => {
    const ada = { ...doc("Ada"), contextEnabled: true };
    const scene = doc("Ch 1");
    const docs = [ada, { ...scene, content: "Ada waves" }];
    expect(findAutoContext(docs, scene.id, "Ada waves")).toEqual([]);
  });

  it("requires word boundaries and a minimum name length", () => {
    const a = doc("Al", []);
    const docs = [a, doc("Ch 1")];
    expect(findAutoContext(docs, docs[1].id, "Alarm went off")).toEqual([]);
    expect(findAutoContext(docs, docs[1].id, "Al said hi")).toEqual([a]);
  });

  it("only scans the trailing window", () => {
    const ada = doc("Ada");
    const docs = [ada, doc("Ch 1")];
    const mentionAtStart = `Ada ${"x".repeat(5000)}`;
    const mentionAtEnd = `${"x".repeat(100)} Ada`;
    expect(findAutoContext(docs, docs[1].id, mentionAtStart, 4000)).toEqual([]);
    expect(findAutoContext(docs, docs[1].id, mentionAtEnd, 4000)).toEqual([ada]);
  });

  it("escapes regex characters in names", () => {
    const weird = doc("Dr. X (ret.)");
    const docs = [weird, doc("Ch 1")];
    expect(findAutoContext(docs, docs[1].id, "I saw Dr. X (ret.) yesterday")).toEqual([weird]);
  });
});
