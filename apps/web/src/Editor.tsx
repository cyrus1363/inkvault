import { flattenTree, wordCount, type DocNode } from "@inkvault/core";

interface EditorProps {
  doc: DocNode | null;
  docs?: DocNode[];
  readOnly?: boolean;
  onSelectDoc?: (id: string) => void;
  onChange?: (content: string) => void;
  onRename?: (title: string) => void;
  onBackslash?: (selection: string, start: number, end: number) => void;
  onSnapshot?: () => void;
  onHistory?: () => void;
}

export default function Editor(props: EditorProps) {
  const words = props.doc ? wordCount(props.doc.content) : 0;
  return (
    <section className="editor">
      {props.readOnly && props.docs && (
        <select value={props.doc?.id ?? ""} onChange={(e) => props.onSelectDoc?.(e.target.value)}>
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
          <div className="editor-toolbar">
            {props.readOnly ? (
              <h2 className="doc-title-readonly">{props.doc.title}</h2>
            ) : (
              <input
                className="doc-title"
                value={props.doc.title}
                onChange={(e) => props.onRename?.(e.target.value)}
              />
            )}
            {!props.readOnly && (
              <span className="row-actions-visible">
                <button onClick={props.onSnapshot}>Snapshot</button>
                <button onClick={props.onHistory}>History</button>
                <span className="muted small">press \ at the end of the text to continue · select text + \ to revise</span>
              </span>
            )}
          </div>
          <textarea
            className="doc-body"
            value={props.doc.content}
            readOnly={props.readOnly}
            placeholder={props.readOnly ? "Pick a document above" : "Start writing…"}
            onChange={(e) => props.onChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "\\" && !props.readOnly) {
                e.preventDefault();
                const ta = e.target as HTMLTextAreaElement;
                props.onBackslash?.(ta.value.slice(ta.selectionStart, ta.selectionEnd), ta.selectionStart, ta.selectionEnd);
              }
            }}
          />
          <div className="status-bar">{words} words</div>
        </>
      ) : (
        <p className="muted placeholder">Select a document in the binder, or create one.</p>
      )}
    </section>
  );
}
