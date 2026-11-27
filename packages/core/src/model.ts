export type DocKind = "folder" | "document";

export interface DocNode {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  kind: DocKind;
  content: string;
  contextEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CachedModel {
  id: string;
  name: string;
  contextWindow: number;
  pricing: { prompt: number; completion: number };
}

export interface Settings {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  models: CachedModel[];
}

export interface GenerationRecord {
  id: string;
  at: string;
  model: string;
  instruction: string;
  promptPreview: string;
  output: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

export function defaultSettings(): Settings {
  return {
    apiKey: "",
    model: "",
    temperature: 0.8,
    maxTokens: 4096,
    systemPrompt: "You are a precise fiction-writing assistant. Follow the instruction exactly.",
    models: [],
  };
}

export function createId(): string {
  return crypto.randomUUID();
}

export function childrenOf(docs: DocNode[], parentId: string | null): DocNode[] {
  return docs.filter((d) => d.parentId === parentId).sort((a, b) => a.order - b.order);
}

export function addDoc(
  docs: DocNode[],
  input: { title: string; kind: DocKind; parentId?: string | null; now?: string },
): { docs: DocNode[]; doc: DocNode } {
  const now = input.now ?? new Date().toISOString();
  const parentId = input.parentId ?? null;
  const order = childrenOf(docs, parentId).length;
  const doc: DocNode = {
    id: createId(),
    title: input.title,
    parentId,
    order,
    kind: input.kind,
    content: "",
    contextEnabled: input.kind === "document",
    createdAt: now,
    updatedAt: now,
  };
  return { docs: [...docs, doc], doc };
}

export function updateDoc(
  docs: DocNode[],
  id: string,
  patch: Partial<Pick<DocNode, "title" | "content" | "contextEnabled" | "kind">>,
  now: string = new Date().toISOString(),
): DocNode[] {
  return docs.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: now } : d));
}

export function deleteDoc(docs: DocNode[], id: string): DocNode[] {
  const doomed = new Set<string>([id]);
  const collect = (parentId: string) => {
    for (const d of docs) {
      if (d.parentId === parentId && !doomed.has(d.id)) {
        doomed.add(d.id);
        collect(d.id);
      }
    }
  };
  collect(id);
  return docs.filter((d) => !doomed.has(d.id));
}

export function moveDoc(docs: DocNode[], id: string, newParentId: string | null, index: number): DocNode[] {
  const node = docs.find((d) => d.id === id);
  if (!node || id === newParentId) return docs;
  let ancestor = newParentId;
  while (ancestor) {
    if (ancestor === id) return docs;
    ancestor = docs.find((d) => d.id === ancestor)?.parentId ?? null;
  }
  const siblings = childrenOf(
    docs.filter((d) => d.id !== id),
    newParentId,
  );
  const clamped = Math.max(0, Math.min(index, siblings.length));
  siblings.splice(clamped, 0, { ...node, parentId: newParentId });
  const reordered = new Map(siblings.map((d, i) => [d.id, { ...d, order: i }]));
  return docs.map((d) => reordered.get(d.id) ?? d);
}

export interface FlatRow {
  node: DocNode;
  depth: number;
}

export function flattenTree(docs: DocNode[], parentId: string | null = null, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const child of childrenOf(docs, parentId)) {
    rows.push({ node: child, depth });
    if (child.kind === "folder") {
      rows.push(...flattenTree(docs, child.id, depth + 1));
    }
  }
  return rows;
}
