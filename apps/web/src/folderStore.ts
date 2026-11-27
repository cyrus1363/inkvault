import { createId, safeFileName, type DocNode, type VaultData } from "@inkvault/core";
import { folderList, readTextFile, writeTextFile } from "./desktop";

/**
 * Plain-Markdown folder mode (opt-in, desktop only).
 *
 * Mirrors the binder as a folder tree: DocNode folders -> directories,
 * documents -> .md files named after their title. Unencrypted BY DESIGN —
 * the user picks the folder (e.g. inside Dropbox) and owns the environment.
 *
 * MVP semantics: one-way write-through on every vault save (files that already
 * contain the same content are skipped), plus an explicit import that rebuilds
 * the document tree from the folder. Deleted documents are NOT removed from
 * the folder.
 */

function joinPath(dir: string, name: string): string {
  return (dir.endsWith("/") || dir.endsWith("\\") ? dir : `${dir}/`) + name;
}

function folderChain(docs: DocNode[], node: DocNode): DocNode[] {
  const chain: DocNode[] = [];
  let parentId = node.parentId;
  const guard = new Set<string>([node.id]);
  while (parentId) {
    if (guard.has(parentId)) break; // cycle safety
    guard.add(parentId);
    const parent = docs.find((d) => d.id === parentId && d.kind === "folder");
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

/** Write every document of the project into the folder tree. Returns files written. */
export async function exportDataToFolder(root: string, data: VaultData): Promise<number> {
  const written = new Set<string>();
  const docs = [...data.documents].sort((a, b) => a.order - b.order);
  let count = 0;
  for (const node of docs) {
    if (node.kind !== "document") continue;
    const segments = folderChain(data.documents, node).map((f) => safeFileName(f.title) || "folder");
    let file = `${safeFileName(node.title) || "untitled"}.md`;
    let rel = [...segments, file].join("/");
    if (written.has(rel)) {
      file = `${safeFileName(node.title) || "untitled"}-${node.id.slice(0, 6)}.md`;
      rel = [...segments, file].join("/");
    }
    written.add(rel);
    const path = joinPath(joinPath(root, segments.join("/")), file);
    // skip write when the file already has this exact content (keeps mtime — sync-friendly)
    try {
      if ((await readTextFile(path)) === node.content) continue;
    } catch {
      // file missing — write below
    }
    await writeTextFile(path, node.content);
    count++;
  }
  return count;
}

/** Rebuild a document tree from the folder: dirs -> folders, .md files -> documents. */
export async function importDataFromFolder(root: string): Promise<DocNode[]> {
  const now = new Date().toISOString();
  async function walk(dir: string, parentId: string | null): Promise<DocNode[]> {
    const entries = await folderList(dir);
    const nodes: DocNode[] = [];
    let order = 0;
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDir) {
        const folder: DocNode = {
          id: createId(),
          title: entry.name,
          parentId,
          order: order++,
          kind: "folder",
          content: "",
          contextEnabled: false,
          createdAt: now,
          updatedAt: now,
        };
        nodes.push(folder);
        nodes.push(...(await walk(joinPath(dir, entry.name), folder.id)));
      } else if (/\.md$/i.test(entry.name)) {
        const content = await readTextFile(joinPath(dir, entry.name));
        nodes.push({
          id: createId(),
          title: entry.name.replace(/\.md$/i, ""),
          parentId,
          order: order++,
          kind: "document",
          content,
          contextEnabled: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return nodes;
  }
  return walk(root, null);
}
