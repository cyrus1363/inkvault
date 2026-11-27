export type DocKind = "folder" | "document";

export interface Snapshot {
  id: string;
  at: string;
  label: string;
  content: string;
}

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
  snapshots?: Snapshot[];
  loreAliases?: string[];
  locked?: boolean;
}

export interface PromptEntry {
  slot: string;
  label: string;
  instruction: string;
}

export interface ChainDef {
  id: string;
  name: string;
  steps: string[];
}

export type ThemeName = "lofi" | "synthwave" | "dark" | "light" | "high-contrast";
export type FontName = "default" | "dyslexic";

export interface CachedModel {
  id: string;
  name: string;
  contextWindow: number;
  pricing: { prompt: number; completion: number };
}

export type ProviderKind = "openrouter" | "local" | "custom" | "anthropic";

export interface ModelCollection {
  id: string;
  name: string;
  modelIds: string[];
}

export interface CuratedList {
  id: string;
  name: string;
  modelIds: string[];
}

export interface Settings {
  provider: ProviderKind;
  apiKey: string;
  model: string;
  localBaseUrl: string;
  localModel: string;
  localModels: string[];
  customBaseUrl: string;
  customApiKey: string;
  anthropicApiKey: string;
  verbosity: string;
  reasoningEffort: string;
  collections: ModelCollection[];
  curatedLists: CuratedList[];
  zenMode: boolean;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  models: CachedModel[];
  promptLibrary: PromptEntry[];
  chains: ChainDef[];
  theme: ThemeName;
  font: FontName;
  autoLorebook: boolean;
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
    provider: "openrouter",
    apiKey: "",
    model: "",
    localBaseUrl: "http://127.0.0.1:8080",
    localModel: "",
    localModels: [],
    customBaseUrl: "",
    customApiKey: "",
    anthropicApiKey: "",
    verbosity: "auto",
    reasoningEffort: "auto",
    collections: [],
    curatedLists: [],
    zenMode: false,
    temperature: 0.8,
    maxTokens: 4096,
    systemPrompt: "You are a precise fiction-writing assistant. Follow the instruction exactly.",
    models: [],
    promptLibrary: [],
    chains: [],
    theme: "lofi",
    font: "default",
    autoLorebook: true,
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
  patch: Partial<Pick<DocNode, "title" | "content" | "contextEnabled" | "kind" | "loreAliases" | "snapshots" | "locked">>,
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

export function duplicateDoc(docs: DocNode[], id: string, now: string = new Date().toISOString()): DocNode[] {
  const src = docs.find((d) => d.id === id);
  if (!src) return docs;
  const clones: DocNode[] = [];
  const clone = (node: DocNode, parentId: string | null, order: number): string => {
    const newId = createId();
    clones.push({
      ...node,
      id: newId,
      parentId,
      order,
      title: node === src ? `${node.title} (copy)` : node.title,
      createdAt: now,
      updatedAt: now,
      snapshots: node.snapshots?.map((s) => ({ ...s, id: createId() })),
    });
    childrenOf(docs, node.id).forEach((c, i) => clone(c, newId, i));
    return newId;
  };
  const newRootId = clone(src, src.parentId, src.order + 1);
  const siblings = childrenOf(docs, src.parentId);
  const at = siblings.findIndex((d) => d.id === src.id);
  const reordered = [...siblings.slice(0, at + 1), clones[0], ...siblings.slice(at + 1)].map((d, i) => ({
    ...d,
    order: i,
  }));
  const reorderedIds = new Set(reordered.map((d) => d.id));
  return [...docs.filter((d) => !reorderedIds.has(d.id)), ...reordered, ...clones.slice(1)].map((d) =>
    d.id === newRootId ? { ...d, order: at + 1 } : d,
  );
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
