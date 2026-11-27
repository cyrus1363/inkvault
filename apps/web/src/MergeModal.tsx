import { useMemo, useState } from "react";
import { splitSentences } from "@inkvault/core";
import type { Take } from "./generate";
import Modal from "./Modal";

export default function MergeModal({
  takes,
  onClose,
  onAppend,
}: {
  takes: Take[];
  onClose: () => void;
  onAppend: (text: string) => void;
}) {
  const [aId, setAId] = useState(takes[0]?.id ?? "");
  const [bId, setBId] = useState(takes[1]?.id ?? "");
  const [choices, setChoices] = useState<Record<number, "A" | "B">>({});

  const a = takes.find((t) => t.id === aId);
  const b = takes.find((t) => t.id === bId);
  const sa = useMemo(() => (a ? splitSentences(a.output) : []), [a]);
  const sb = useMemo(() => (b ? splitSentences(b.output) : []), [b]);
  const rows = Math.max(sa.length, sb.length);

  const merged = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < rows; i++) {
      const pick = choices[i] ?? "A";
      const sentence = pick === "A" ? sa[i] : sb[i];
      if (sentence) out.push(sentence);
    }
    return out.join(" ");
  }, [choices, sa, sb, rows]);

  const pick = (i: number, side: "A" | "B") => setChoices((c) => ({ ...c, [i]: side }));

  return (
    <Modal title="Merge takes (sentence-level kit-bash)" onClose={onClose}>
      <div className="panel-row">
        <select value={aId} onChange={(e) => setAId(e.target.value)}>
          {takes.map((t) => (
            <option key={t.id} value={t.id}>
              A: {t.label}
            </option>
          ))}
        </select>
        <select value={bId} onChange={(e) => setBId(e.target.value)}>
          {takes.map((t) => (
            <option key={t.id} value={t.id}>
              B: {t.label}
            </option>
          ))}
        </select>
        <button onClick={() => setChoices(Object.fromEntries(Array.from({ length: rows }, (_, i) => [i, "A" as const])))}>
          All A
        </button>
        <button onClick={() => setChoices(Object.fromEntries(Array.from({ length: rows }, (_, i) => [i, "B" as const])))}>
          All B
        </button>
      </div>
      <div className="merge-rows">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="merge-row">
            <span className="muted small">{i + 1}</span>
            <span className={"merge-sentence" + (choices[i] === "A" || choices[i] === undefined ? " chosen-a" : "")}>
              {sa[i] ?? <em className="muted">—</em>}
            </span>
            <span className={"merge-sentence" + (choices[i] === "B" ? " chosen-b" : "")}>
              {sb[i] ?? <em className="muted">—</em>}
            </span>
            <span className="panel-row">
              <button className={choices[i] !== "B" ? "pick active" : "pick"} onClick={() => pick(i, "A")}>
                A
              </button>
              <button className={choices[i] === "B" ? "pick active" : "pick"} onClick={() => pick(i, "B")}>
                B
              </button>
            </span>
          </div>
        ))}
      </div>
      <pre className="output small-output">{merged}</pre>
      <div className="panel-row">
        <button onClick={() => { onAppend(merged); onClose(); }} disabled={!merged}>
          Append merged to doc
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
