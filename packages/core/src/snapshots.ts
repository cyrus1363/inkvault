import { createId, type DocNode, type Snapshot } from "./model.js";

export const MAX_SNAPSHOTS = 50;

export function takeSnapshot(doc: DocNode, label?: string, now: string = new Date().toISOString()): Snapshot[] {
  const snapshot: Snapshot = {
    id: createId(),
    at: now,
    label: label?.trim() || `Snapshot ${now}`,
    content: doc.content,
  };
  return [snapshot, ...(doc.snapshots ?? [])].slice(0, MAX_SNAPSHOTS);
}

export function listSnapshots(doc: DocNode): Snapshot[] {
  return doc.snapshots ?? [];
}
