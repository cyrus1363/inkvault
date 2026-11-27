import { useEffect, useMemo, useRef, useState } from "react";
import {
  compilePrompt,
  estimateCostUsd,
  estimateTokens,
  fetchModels,
  flattenTree,
  type CompiledPrompt,
  type DocNode,
  type VaultData,
} from "@inkvault/core";
import { useGenerate } from "./generate";
import Modal from "./Modal";

interface Props {
  data: VaultData;
  activeDoc: DocNode | null;
  updateData: (mutate: (d: VaultData) => VaultData) => void;
  onAppend: (text: string) => void;
  pendingInstruction: { text: string; nonce: number } | null;
}

export default function PromptPanel({ data, activeDoc, updateData, onAppend, pendingInstruction }: Props) {
  const s = data.settings;
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<CompiledPrompt | null>(null);
  const [showLast, setShowLast] = useState(false);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelError, setModelError] = useState<string>();
  const lastNonceRef = useRef(0);

  const gen = useGenerate(data, updateData);

  const contextDocs = useMemo(
    () =>
      flattenTree(data.documents)
        .map((r) => r.node)
        .filter((d) => d.kind === "document" && d.contextEnabled),
    [data.documents],
  );
  const contextTokens = useMemo(
    () => contextDocs.reduce((n, d) => n + estimateTokens(d.content), 0),
    [contextDocs],
  );
  const promptEst = useMemo(
    () =>
      contextTokens +
      estimateTokens(instruction) +
      estimateTokens(s.systemPrompt) +
      (activeDoc ? estimateTokens(activeDoc.content) : 0),
    [contextTokens, instruction, s.systemPrompt, activeDoc],
  );
  const maxCostUsd = gen.pricing ? estimateCostUsd(gen.pricing, promptEst, s.maxTokens) : null;

  const buildInput = (text: string) => ({ instruction: text, contextDocs, activeDoc });

  async function refreshModels() {
    setModelsBusy(true);
    setModelError(undefined);
    try {
      const models = await fetchModels(s.apiKey);
      updateData((d) => ({ ...d, settings: { ...d.settings, models } }));
    } catch (e) {
      setModelError(e instanceof Error ? e.message : String(e));
    } finally {
      setModelsBusy(false);
    }
  }

  useEffect(() => {
    if (!pendingInstruction || pendingInstruction.nonce === lastNonceRef.current) return;
    lastNonceRef.current = pendingInstruction.nonce;
    setInstruction(pendingInstruction.text);
    void gen.generate(buildInput(pendingInstruction.text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInstruction]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !/^[0-9]$/.test(e.key)) return;
      const entry = s.promptLibrary.find((p) => p.slot === e.key);
      if (!entry?.instruction) return;
      e.preventDefault();
      setInstruction(entry.instruction);
      void gen.generate(buildInput(entry.instruction));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.promptLibrary, contextDocs, activeDoc, gen.generate]);

  const lastGeneration = data.generations[0];

  return (
    <aside className="prompt-panel">
      <div className="panel-row">
        {s.models.length > 0 ? (
          <select
            value={s.model}
            onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, model: e.target.value } }))}
          >
            <option value="">Select model…</option>
            {s.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.id})
              </option>
            ))}
          </select>
        ) : (
          <input
            placeholder="Model id, e.g. openai/gpt-4o"
            value={s.model}
            onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, model: e.target.value } }))}
          />
        )}
        <button onClick={refreshModels} disabled={modelsBusy || !s.apiKey} title="Fetch model list + pricing from OpenRouter">
          {modelsBusy ? "…" : "Models"}
        </button>
      </div>
      <div className="panel-row sliders">
        <label>
          Temp{" "}
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={s.temperature}
            onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, temperature: Number(e.target.value) } }))}
          />{" "}
          {s.temperature}
        </label>
        <label>
          Max tokens{" "}
          <input
            type="number"
            min={64}
            max={16384}
            step={64}
            value={s.maxTokens}
            onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, maxTokens: Number(e.target.value) } }))}
          />
        </label>
      </div>
      <textarea
        placeholder="Instruction, e.g. Continue the scene… (Ctrl/Cmd+1–0 run saved prompts)"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
      />
      <div className="muted small">
        Context: {contextDocs.length} doc(s) ≈ {contextTokens} tok · prompt ≈ {promptEst} tok
        {maxCostUsd !== null ? ` · up to $${maxCostUsd.toFixed(4)}` : ""}
      </div>
      <div className="panel-row buttons">
        <button
          onClick={() => setPreview(compilePrompt({ systemPrompt: s.systemPrompt, instruction, contextDocs, activeDoc }))}
        >
          Preview prompt
        </button>
        <button onClick={() => setShowLast(true)} disabled={!lastGeneration}>
          Last prompt
        </button>
        {gen.streaming ? (
          <button onClick={gen.stop}>Stop</button>
        ) : (
          <button onClick={() => void gen.generate(buildInput(instruction))} disabled={!instruction.trim() || !s.model}>
            Generate
          </button>
        )}
        <button onClick={() => onAppend(gen.output)} disabled={!gen.output || !activeDoc}>
          Append to doc
        </button>
        <button onClick={gen.clear} disabled={!gen.output}>
          Clear
        </button>
      </div>
      {gen.error && <p className="error small">{gen.error}</p>}
      {modelError && <p className="error small">{modelError}</p>}
      <pre className="output">{gen.output}{gen.streaming ? "▌" : ""}</pre>
      {preview && (
        <Modal title="Prompt preview" onClose={() => setPreview(null)}>
          <div className="muted small">
            {preview.includedDocs.length} context doc(s) · ≈{preview.estimatedPromptTokens} prompt tokens
          </div>
          {preview.messages.map((m, i) => (
            <div key={i} className="msg">
              <span className="role">{m.role}</span>
              <pre>{m.content}</pre>
            </div>
          ))}
        </Modal>
      )}
      {showLast && lastGeneration && (
        <Modal
          title={`Last prompt — ${lastGeneration.model} · ${lastGeneration.at}`}
          onClose={() => setShowLast(false)}
        >
          <div className="muted small">Instruction: {lastGeneration.instruction}</div>
          <pre>{lastGeneration.promptPreview}</pre>
          {lastGeneration.costUsd !== null && (
            <div className="muted small">
              Cost: ${lastGeneration.costUsd.toFixed(6)} · prompt {lastGeneration.promptTokens} tok · completion{" "}
              {lastGeneration.completionTokens} tok
            </div>
          )}
        </Modal>
      )}
    </aside>
  );
}
