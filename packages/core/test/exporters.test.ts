import { describe, expect, it } from "vitest";
import {
  addDoc,
  emptyVaultData,
  exportDocx,
  exportMarkdown,
  exportProjectZip,
  exportTxt,
  updateDoc,
  utf8Decode,
} from "../src/index.js";

function makeDoc(title: string, content: string) {
  const { doc } = addDoc([], { title, kind: "document" });
  return { ...doc, content };
}

describe("exporters", () => {
  it("exports markdown with a title header", () => {
    expect(exportMarkdown(makeDoc("Ch 1", "body"))).toBe("# Ch 1\n\nbody\n");
  });

  it("exports txt as raw content", () => {
    expect(exportTxt(makeDoc("Ch 1", "body"))).toBe("body\n");
  });

  it("exports a minimal valid docx (zip with document.xml, escaped content)", () => {
    const docx = exportDocx(makeDoc('A "quote" <scene>', "line1\nline2 & more"));
    const view = new DataView(docx.buffer, docx.byteOffset, docx.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const text = utf8Decode(docx);
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("word/document.xml");
    expect(text).toContain("line1");
    expect(text).toContain("line2 &amp; more");
    expect(text).toContain("A &quot;quote&quot; &lt;scene&gt;");
  });

  it("exports a project zip with one md per document and no API key", () => {
    let data = emptyVaultData();
    const { docs, doc: ch1 } = addDoc(data.documents, { title: "Ch 1", kind: "document" });
    data = { ...data, documents: updateDoc(docs, ch1.id, { content: "hello" }), settings: { ...data.settings, apiKey: "sk-or-secret" } };
    const zip = exportProjectZip(data);
    const text = utf8Decode(zip);
    expect(text).toContain("Ch 1.md");
    expect(text).toContain("# Ch 1");
    expect(text).toContain("vault.json");
    expect(text).not.toContain("sk-or-secret");
  });
});
