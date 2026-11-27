import { useState } from "react";
import { replaceAll, type DocNode, type VaultData } from "@inkvault/core";
import Modal from "./Modal";

export default function FindReplaceModal({
  data,
  activeDoc,
  updateData,
  onClose,
}: {
  data: VaultData;
  activeDoc: DocNode | null;
  updateData: (mutate: (d: VaultData) => VaultData) => void;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [lastCount, setLastCount] = useState<number | null>(null);

  function applyToDoc(docId: string) {
    const doc = data.documents.find((d) => d.id === docId);
    if (!doc) return;
    const { content, count } = replaceAll(doc.content, find, replace);
    setLastCount(count);
    updateData((d) => ({
      ...d,
      documents: d.documents.map((x) => (x.id === docId ? { ...x, content, updatedAt: new Date().toISOString() } : x)),
    }));
  }

  function applyToProject() {
    if (!find) return;
    let total = 0;
    updateData((d) => ({
      ...d,
      documents: d.documents.map((x) => {
        if (x.kind !== "document") return x;
        const { content, count } = replaceAll(x.content, find, replace);
        total += count;
        return count ? { ...x, content, updatedAt: new Date().toISOString() } : x;
      }),
    }));
    setLastCount(total);
  }

  return (
    <Modal title="Find & replace" onClose={onClose}>
      <label>
        Find
        <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} />
      </label>
      <label>
        Replace with
        <input value={replace} onChange={(e) => setReplace(e.target.value)} />
      </label>
      {lastCount !== null && <p className="muted small">{lastCount} replacement(s)</p>}
      <div className="panel-row">
        <button onClick={() => activeDoc && applyToDoc(activeDoc.id)} disabled={!find || !activeDoc}>
          Replace in current doc
        </button>
        <button onClick={applyToProject} disabled={!find}>
          Replace in whole project
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
