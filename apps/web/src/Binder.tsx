import { useState } from "react";
import { childrenOf, flattenTree, type DocKind, type DocNode } from "@inkvault/core";

interface BinderProps {
  docs: DocNode[];
  activeDocId: string | null;
  onSelect: (id: string) => void;
  onAdd: (kind: DocKind, parentId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onToggleContext: (id: string, enabled: boolean) => void;
  onMove: (id: string, parentId: string | null, index: number) => void;
  onDuplicate: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
}

export default function Binder(props: BinderProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const rows = flattenTree(props.docs).filter((r) => {
    let p = r.node.parentId;
    while (p) {
      if (collapsed.has(p)) return false;
      p = props.docs.find((d) => d.id === p)?.parentId ?? null;
    }
    return true;
  });

  function toggleCollapsed(id: string) {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dropOn(target: DocNode) {
    if (!dragId || dragId === target.id) return;
    if (target.kind === "folder") {
      props.onMove(dragId, target.id, childrenOf(props.docs, target.id).length);
    } else {
      props.onMove(dragId, target.parentId, target.order);
    }
    setDragId(null);
  }

  return (
    <aside className="binder">
      <div className="binder-toolbar">
        <button onClick={() => props.onAdd("document", null)}>+ Doc</button>
        <button onClick={() => props.onAdd("folder", null)}>+ Folder</button>
      </div>
      <ul className="binder-list">
        {rows.map(({ node, depth }) => (
          <li
            key={node.id}
            draggable
            onDragStart={(e) => {
              setDragId(node.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              dropOn(node);
            }}
            className={
              (node.kind === "folder" ? "folder-row" : "doc-row") +
              (node.id === props.activeDocId ? " active" : "") +
              (dragId === node.id ? " dragging" : "") +
              (node.locked ? " locked" : "")
            }
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
          >
            {node.kind === "folder" && (
              <button className="twisty" onClick={() => toggleCollapsed(node.id)}>
                {collapsed.has(node.id) ? "▸" : "▾"}
              </button>
            )}
            {node.kind === "document" && (
              <input
                type="checkbox"
                title="Include in AI context"
                checked={node.contextEnabled}
                onChange={(e) => props.onToggleContext(node.id, e.target.checked)}
              />
            )}
            {renamingId === node.id ? (
              <input
                className="rename"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  if (renameValue.trim()) props.onRename(node.id, renameValue.trim());
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <span
                className="title"
                onClick={() => node.kind === "document" && props.onSelect(node.id)}
                onDoubleClick={() => {
                  setRenamingId(node.id);
                  setRenameValue(node.title);
                }}
              >
                {node.locked ? "🔒 " : ""}
                {node.title}
              </span>
            )}
            <span className="row-actions">
              {node.kind === "folder" && (
                <button title="Add document here" onClick={() => props.onAdd("document", node.id)}>
                  +
                </button>
              )}
              <button title="Duplicate (deep copy)" onClick={() => props.onDuplicate(node.id)}>
                ⧉
              </button>
              <button
                title={node.locked ? "Unlock document" : "Lock document (read-only)"}
                onClick={() => props.onToggleLock(node.id, !node.locked)}
              >
                {node.locked ? "🔒" : "🔓"}
              </button>
              <button
                title="Delete"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${node.title}"${node.kind === "folder" ? " and everything inside it" : ""}?`,
                    )
                  ) {
                    props.onDelete(node.id);
                  }
                }}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
