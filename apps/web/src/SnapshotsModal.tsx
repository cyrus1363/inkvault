import { useState } from "react";
import { diffText, listSnapshots, takeSnapshot, type DocNode, type VaultData } from "@inkvault/core";
import DiffModal from "./DiffModal";
import Modal from "./Modal";

export default function SnapshotsModal({
  doc,
  updateData,
  onClose,
}: {
  doc: DocNode;
  updateData: (mutate: (d: VaultData) => VaultData) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [compare, setCompare] = useState<{ label: string; hunks: ReturnType<typeof diffText> } | null>(null);
  const snapshots = listSnapshots(doc);

  function saveSnapshot() {
    updateData((d) => ({
      ...d,
      documents: d.documents.map((x) =>
        x.id === doc.id ? { ...x, snapshots: takeSnapshot(x, label), updatedAt: new Date().toISOString() } : x,
      ),
    }));
    setLabel("");
  }

  function restore(snapshotId: string) {
    const snap = snapshots.find((s) => s.id === snapshotId);
    if (!snap) return;
    if (!window.confirm(`Restore "${snap.label}"? The current text will be snapshotted first.`)) return;
    updateData((d) => ({
      ...d,
      documents: d.documents.map((x) =>
        x.id === doc.id
          ? { ...x, content: snap.content, snapshots: takeSnapshot(x, `before restore of ${snap.label}`), updatedAt: new Date().toISOString() }
          : x,
      ),
    }));
    onClose();
  }

  return (
    <>
      <Modal title={`Snapshots — ${doc.title}`} onClose={onClose}>
        <div className="panel-row">
          <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button onClick={saveSnapshot}>Take snapshot</button>
        </div>
        {snapshots.length === 0 && <p className="muted">No snapshots yet.</p>}
        {snapshots.map((s) => (
          <div key={s.id} className="snapshot-row">
            <span className="title">{s.label}</span>
            <span className="muted small">{s.at}</span>
            <button onClick={() => setCompare({ label: s.label, hunks: diffText(s.content, doc.content) })}>
              Compare
            </button>
            <button onClick={() => restore(s.id)}>Restore</button>
          </div>
        ))}
        <div className="panel-row">
          <button onClick={onClose}>Close</button>
        </div>
      </Modal>
      {compare && (
        <DiffModal
          title={`Compare: ${compare.label} → current`}
          hunks={compare.hunks}
          onClose={() => setCompare(null)}
        />
      )}
    </>
  );
}
