import { flattenTree, type DocNode } from "@inkvault/core";

interface EditorProps {
  doc: DocNode | null;
  docs?: DocNode[];
  readOnly?: boolean;
  onSelectDoc?: (id: string) => void;
  onChange?: (content: string) => void;
  onRename?: (title: string) => void;
}

export default function Editor(props: EditorProps) {
  const words = props.doc ? props.doc.content.trim().split(/\s+/).filter(Boolean).length : 0;
  return (
    <section className="editor">
      {props.readOnly && props.docs && (
        <select
          value={props.doc?.id ?? ""}
          onChange={(e) => props.onSelectDoc?.(e.target.value)}
        >
          <option value="">Choose reference document…</option>
          {flattenTree(props.docs)
            .filter((r) => r.node.kind === "document")
            .map((r) => (
              <option key={r.node.id} value={r.node.id}>
                {r.node.title}
              </option>
            ))}
        </select>
      )}
      {props.doc ? (
        <>
          {props.readOnly ? (
            <h2 className="doc-title-readonly">{props.doc.title}</h2>
          ) : (
            <input
              className="doc-title"
              value={props.doc.title}
              onChange={(e) => props.onRename?.(e.target.value)}
            />
          )}
          <textarea
            className="doc-body"
            value={props.doc.content}
            readOnly={props.readOnly}
            placeholder={props.readOnly ? "Pick a document above" : "Start writing…"}
            onChange={(e) => props.onChange?.(e.target.value)}
          />
          <div className="status-bar">{words} words</div>
        </>
      ) : (
        <p className="muted placeholder">Select a document in the binder, or create one.</p>
      )}
    </section>
  );
}
