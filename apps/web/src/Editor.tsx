import { useRef } from "react";
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
  onUnlock?: () => void;
}

export default function Editor(props: EditorProps) {
  const words = props.doc ? wordCount(props.doc.content) : 0;
  const taRef = useRef<HTMLTextAreaElement>(null);

  function wrapSelection(before: string, after: string = before) {
    const ta = taRef.current;
    if (!ta || !props.onChange || !props.doc) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    props.onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = e + before.length;
    });
  }

  function toggleLinePrefix(prefix: string) {
    const ta = taRef.current;
    if (!ta || !props.onChange || !props.doc) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(lineStart, e);
    const nextBlock = block
      .split("\n")
      .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
      .join("\n");
    props.onChange(value.slice(0, lineStart) + nextBlock + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + nextBlock.length;
    });
  }

  const fmt = [
    { label: "B", title: "Bold (Ctrl+B)", run: () => wrapSelection("**") },
    { label: "I", title: "Italic (Ctrl+I)", run: () => wrapSelection("*") },
    { label: "S", title: "Strikethrough", run: () => wrapSelection("~~") },
    { label: "`", title: "Inline code", run: () => wrapSelection("`") },
    { label: "H1", title: "Heading 1", run: () => toggleLinePrefix("# ") },
    { label: "H2", title: "Heading 2", run: () => toggleLinePrefix("## ") },
    { label: "H3", title: "Heading 3", run: () => toggleLinePrefix("### ") },
    { label: ">", title: "Quote block", run: () => toggleLinePrefix("> ") },
    { label: "•", title: "List item", run: () => toggleLinePrefix("- ") },
  ];
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
          {props.doc.locked && (
            <div className="lock-banner">
              🔒 Locked (read-only). <button onClick={props.onUnlock}>Unlock</button>
            </div>
          )}
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
                {fmt.map((f) => (
                  <button key={f.label} className="fmt-btn" title={f.title} onClick={f.run}>
                    {f.label}
                  </button>
                ))}
                <button onClick={props.onSnapshot}>Snapshot</button>
                <button onClick={props.onHistory}>History</button>
                <span className="muted small">press \ at the end of the text to continue · select text + \ to revise</span>
              </span>
            )}
          </div>
          <textarea
            ref={taRef}
            className="doc-body"
            value={props.doc.content}
            readOnly={props.readOnly || props.doc.locked}
            placeholder={props.readOnly ? "Pick a document above" : "Start writing…"}
            onChange={(e) => props.onChange?.(e.target.value)}
            onKeyDown={(e) => {
              const ta = e.target as HTMLTextAreaElement;
              if ((e.ctrlKey || e.metaKey) && !props.readOnly) {
                if (e.key === "b") {
                  e.preventDefault();
                  wrapSelection("**");
                } else if (e.key === "i") {
                  e.preventDefault();
                  wrapSelection("*");
                }
                return;
              }
              if (e.key === "\\" && !props.readOnly) {
                e.preventDefault();
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
