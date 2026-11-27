import type { DocNode } from "./model.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findAutoContext(docs: DocNode[], activeDocId: string | null, activeContent: string, windowChars = 4000): DocNode[] {
  const haystack = activeContent.slice(-windowChars).toLowerCase();
  const out: DocNode[] = [];
  for (const doc of docs) {
    if (doc.kind !== "document" || doc.id === activeDocId || doc.contextEnabled) continue;
    const names = [doc.title, ...(doc.loreAliases ?? [])].filter((n) => n.trim().length >= 2);
    if (names.some((n) => new RegExp(`(?:^|\\W)${escapeRegExp(n.trim().toLowerCase())}(?:\\W|$)`).test(haystack))) {
      out.push(doc);
    }
  }
  return out;
}
