import { useState } from "react";
import { hunkText, type DiffHunk } from "@inkvault/core";
import Modal from "./Modal";

export default function DiffModal({
  title,
  hunks,
  onClose,
  onApply,
}: {
  title: string;
  hunks: DiffHunk[];
  onClose: () => void;
  onApply?: (accepted: (index: number) => boolean) => void;
}) {
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(hunks.map((h, i) => (h.type === "keep" ? -1 : i)).filter((i) => i >= 0)),
  );

  const toggle = (i: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <Modal title={title} onClose={onClose}>
      {hunks.length === 0 && <p className="muted">No differences.</p>}
      {hunks.map((h, i) => (
        <div key={i} className={`hunk ${h.type}`}>
          <div className="hunk-head">
            {h.type === "del" && (
              <label>
                <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} /> accept removal
              </label>
            )}
            {h.type === "add" && (
              <label>
                <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} /> accept addition
              </label>
            )}
            {h.type === "keep" && <span className="muted small">unchanged</span>}
          </div>
          <pre>{hunkText(h)}</pre>
        </div>
      ))}
      <div className="panel-row">
        {onApply && (
          <button onClick={() => onApply((i) => accepted.has(i))}>Apply accepted</button>
        )}
        <button onClick={onClose}>{onApply ? "Cancel" : "Close"}</button>
      </div>
    </Modal>
  );
}
