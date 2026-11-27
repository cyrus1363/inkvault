import { utf8Encode } from "./crypto.js";
import { flattenTree, type DocNode } from "./model.js";
import type { VaultData } from "./types.js";
import { zipStore, type ZipEntry } from "./zip.js";

export function exportMarkdown(doc: DocNode): string {
  return `# ${doc.title}\n\n${doc.content}\n`;
}

export function exportTxt(doc: DocNode): string {
  return `${doc.content}\n`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportDocx(doc: DocNode): Uint8Array {
  const titleParagraph = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(doc.title)}</w:t></w:r></w:p>`;
  const paragraphs =
    titleParagraph +
    doc.content
      .split("\n")
      .map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`)
      .join("");
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  return zipStore([
    { name: "[Content_Types].xml", data: utf8Encode(contentTypes) },
    { name: "_rels/.rels", data: utf8Encode(rels) },
    { name: "word/document.xml", data: utf8Encode(documentXml) },
  ]);
}

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled";
}

export function exportProjectZip(data: VaultData): Uint8Array {
  const entries: ZipEntry[] = [];
  const seen = new Map<string, number>();
  for (const row of flattenTree(data.documents)) {
    if (row.node.kind !== "document") continue;
    const base = `${safeFileName(row.node.title)}.md`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const name = count === 0 ? base : base.replace(/\.md$/, ` (${count}).md`);
    entries.push({ name, data: utf8Encode(exportMarkdown(row.node)) });
  }
  const metadata = {
    app: data.app,
    schema: data.schema,
    exportedAt: new Date().toISOString(),
    settings: { ...data.settings, apiKey: "" },
  };
  entries.push({ name: "vault.json", data: utf8Encode(JSON.stringify(metadata, null, 2)) });
  return zipStore(entries);
}
