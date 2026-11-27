import { describe, expect, it } from "vitest";
import { addDoc, listSnapshots, MAX_SNAPSHOTS, takeSnapshot, updateDoc } from "../src/index.js";

function makeDoc(content: string) {
  const { doc } = addDoc([], { title: "Ch 1", kind: "document" });
  return { ...doc, content };
}

describe("snapshots", () => {
  it("prepends snapshots and lists newest first", () => {
    let doc = makeDoc("v1");
    doc = { ...doc, snapshots: takeSnapshot(doc, "first", "2026-01-01T00:00:00Z") };
    doc = { ...updateDoc([doc], doc.id, { content: "v2" })[0], snapshots: takeSnapshot({ ...doc, content: "v2" }, "second", "2026-01-02T00:00:00Z") };
    const snaps = listSnapshots(doc);
    expect(snaps.map((s) => s.label)).toEqual(["second", "first"]);
    expect(snaps[0].content).toBe("v2");
    expect(snaps[1].content).toBe("v1");
  });

  it("caps the snapshot list at MAX_SNAPSHOTS", () => {
    let doc = makeDoc("v0");
    for (let i = 1; i <= MAX_SNAPSHOTS + 5; i++) {
      doc = { ...doc, content: `v${i}`, snapshots: takeSnapshot(doc, `s${i}`) };
    }
    expect(listSnapshots(doc)).toHaveLength(MAX_SNAPSHOTS);
    expect(listSnapshots(doc)[0].label).toBe(`s${MAX_SNAPSHOTS + 5}`);
  });

  it("defaults the label to a timestamp", () => {
    const doc = makeDoc("x");
    const snaps = takeSnapshot(doc, undefined, "2026-03-04T05:06:07Z");
    expect(snaps[0].label).toBe("Snapshot 2026-03-04T05:06:07Z");
  });
});
