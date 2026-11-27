import { describe, expect, it } from "vitest";
import {
  addDoc,
  childrenOf,
  deleteDoc,
  flattenTree,
  moveDoc,
  updateDoc,
  type DocNode,
} from "../src/index.js";

const NOW = "2026-01-01T00:00:00.000Z";

interface Fixture {
  docs: DocNode[];
  folder: DocNode;
  notes: DocNode;
}

function buildDocs(): Fixture {
  let docs: DocNode[] = [];
  let folder: DocNode;
  let notes: DocNode;
  ({ docs, doc: folder } = addDoc(docs, { title: "Foundation", kind: "folder", now: NOW }));
  ({ docs } = addDoc(docs, { title: "Ch 1", kind: "document", parentId: folder.id, now: NOW }));
  ({ docs } = addDoc(docs, { title: "Ch 2", kind: "document", parentId: folder.id, now: NOW }));
  ({ docs, doc: notes } = addDoc(docs, { title: "Notes", kind: "document", now: NOW }));
  return { docs, folder, notes };
}

describe("model", () => {
  it("adds documents with stable ids and per-parent ordering", () => {
    const { docs, folder } = buildDocs();
    expect(docs).toHaveLength(4);
    expect(childrenOf(docs, null).map((d) => d.title)).toEqual(["Foundation", "Notes"]);
    expect(childrenOf(docs, folder.id).map((d) => d.order)).toEqual([0, 1]);
  });

  it("updates a document immutably", () => {
    const { docs } = buildDocs();
    const target = docs.find((d) => d.title === "Ch 1")!;
    const next = updateDoc(docs, target.id, { content: "text", contextEnabled: false }, NOW);
    expect(next.find((d) => d.id === target.id)?.content).toBe("text");
    expect(next.find((d) => d.id === target.id)?.contextEnabled).toBe(false);
    expect(docs.find((d) => d.id === target.id)?.content).toBe("");
  });

  it("deletes a whole subtree", () => {
    const { docs, folder } = buildDocs();
    expect(deleteDoc(docs, folder.id).map((d) => d.title)).toEqual(["Notes"]);
  });

  it("moves a document into a folder and reorders siblings", () => {
    const { docs, folder, notes } = buildDocs();
    const next = moveDoc(docs, notes.id, folder.id, 0);
    const inFolder = childrenOf(next, folder.id);
    expect(inFolder.map((d) => d.title)).toEqual(["Notes", "Ch 1", "Ch 2"]);
    expect(inFolder.map((d) => d.order)).toEqual([0, 1, 2]);
    expect(childrenOf(next, null)).toHaveLength(1);
  });

  it("refuses to move a folder into its own descendant", () => {
    const { docs, folder } = buildDocs();
    const ch1 = docs.find((d) => d.title === "Ch 1")!;
    expect(moveDoc(docs, folder.id, ch1.id, 0)).toBe(docs);
  });

  it("flattens the tree depth-first in order", () => {
    const { docs } = buildDocs();
    expect(flattenTree(docs).map((r) => `${r.depth}:${r.node.title}`)).toEqual([
      "0:Foundation",
      "1:Ch 1",
      "1:Ch 2",
      "0:Notes",
    ]);
  });
});
