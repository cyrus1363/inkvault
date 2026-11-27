import { useMemo, useState } from "react";
import { applyHunks, diffText, flattenTree, type DocNode, type VaultData } from "@inkvault/core";
import { useGenerate } from "./generate";
import DiffModal from "./DiffModal";
import Modal from "./Modal";

export default function ReviseModal({
  data,
  doc,
  start,
  end,
  selection,
  updateData,
  onClose,
}: {
  data: VaultData;
  doc: DocNode;
  start: number;
  end: number;
  selection: string;
  updateData: (mutate: (d: VaultData) => VaultData) => void;
  onClose: () => void;
}) {
  const [directions, setDirections] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const gen = useGenerate(data, updateData);

  const contextDocs = useMemo(
    () =>
      flattenTree(data.documents)
        .map((r) => r.node)
        .filter((d) => d.kind === "document" && d.contextEnabled && d.id !== doc.id),
    [data.documents, doc.id],
  );

  const hunks = useMemo(
    () => (gen.output ? diffText(selection, gen.output) : []),
    [gen.output, selection],
  );

  async function run() {
    const result = await gen.generate({
      instruction: "",
      contextDocs,
      activeDoc: null,
      selectionOverride: { text: selection, directions: directions.trim() || "improve it" },
    });
    if (result) setShowDiff(true);
  }

  function apply(accepted: (index: number) => boolean) {
    const replacement = applyHunks(hunks, accepted);
    const next = doc.content.slice(0, start) + replacement + doc.content.slice(end);
    updateData((d) => ({
      ...d,
      documents: d.documents.map((x) => (x.id === doc.id ? { ...x, content: next, updatedAt: new Date().toISOString() } : x)),
    }));
    onClose();
  }

  return (
    <>
      <Modal title={`Revise selection in "${doc.title}"`} onClose={onClose}>
        <div className="muted small">Selected text is sent with your directions. Accept or reject each change hunk.</div>
        <pre className="selection-preview">{selection}</pre>
        <label>
          Directions (placed in [brackets] in the prompt)
          <textarea
            autoFocus
            rows={3}
            placeholder="[Make it sharper, remove clichés…]"
            value={directions}
            onChange={(e) => setDirections(e.target.value)}
          />
        </label>
        {gen.error && <p className="error small">{gen.error}</p>}
        <div className="panel-row">
          {gen.streaming ? (
            <button onClick={gen.stop}>Stop</button>
          ) : (
            <button onClick={run} disabled={!directions.trim() && !selection}>
              Run revise
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
        </div>
        {gen.output && (
          <>
            <pre className="output small-output">{gen.output}</pre>
            <button onClick={() => setShowDiff(true)}>Review changes…</button>
          </>
        )}
      </Modal>
      {showDiff && (
        <DiffModal
          title={`Revise diff — ${hunks.length} hunk(s)`}
          hunks={hunks}
          onClose={() => setShowDiff(false)}
          onApply={apply}
        />
      )}
    </>
  );
}
