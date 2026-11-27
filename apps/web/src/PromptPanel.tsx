import { useMemo, useRef, useState } from "react";
import {
  compilePrompt,
  estimateCostUsd,
  estimateTokens,
  fetchModels,
  flattenTree,
  streamChat,
  type CompiledPrompt,
  type DocNode,
  type VaultData,
} from "@inkvault/core";
import Modal from "./Modal";

interface Props {
  data: VaultData;
  activeDoc: DocNode | null;
  updateData: (mutate: (d: VaultData) => VaultData) => void;
  onAppend: (text: string) => void;
}

export default function PromptPanel({ data, activeDoc, updateData, onAppend }: Props) {
  const s = data.settings;
  const [instruction, setInstruction] = useState("");
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<CompiledPrompt | null>(null);
  const [showLast, setShowLast] = useState(false);
  const [modelsBusy, setModelsBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
  const buildPrompt = () =>
    compilePrompt({ systemPrompt: s.systemPrompt, instruction, contextDocs, activeDoc });
  const promptEst = useMemo(() => {
    const p = compilePrompt({ systemPrompt: s.systemPrompt, instruction, contextDocs, activeDoc });
    return p.estimatedPromptTokens;
  }, [s.systemPrompt, instruction, contextDocs, activeDoc]);
  const pricing = s.models.find((m) => m.id === s.model)?.pricing;
  const maxCostUsd = pricing ? estimateCostUsd(pricing, promptEst, s.maxTokens) : null;

  async function refreshModels() {
    setModelsBusy(true);
    setError(undefined);
    try {
      const models = await fetchModels(s.apiKey);
      updateData((d) => ({ ...d, settings: { ...d.settings, models } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setModelsBusy(false);
    }
  }

  async function generate() {
    const compiled = buildPrompt();
    setError(undefined);
    setOutput("");
    setStreaming(true);
    abortRef.current = new AbortController();
    try {
      const info = await streamChat(
        {
          apiKey: s.apiKey,
          model: s.model,
          messages: compiled.messages,
          temperature: s.temperature,
          maxTokens: s.maxTokens,
          signal: abortRef.current.signal,
        },
        { onDelta: (d) => setOutput((o) => o + d) },
      );
      const cost = pricing
        ? estimateCostUsd(pricing, info.promptTokens ?? compiled.estimatedPromptTokens, info.completionTokens ?? 0)
        : null;
      updateData((d) => ({
        ...d,
        generations: [
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            model: s.model,
            instruction,
            promptPreview: compiled.messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n"),
            output: info.content,
            promptTokens: info.promptTokens,
            completionTokens: info.completionTokens,
            costUsd: cost,
          },
          ...d.generations,
        ].slice(0, 50),
      }));
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setStreaming(false);
    }
  }

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
        placeholder="Instruction, e.g. Continue the scene…"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
      />
      <div className="muted small">
        Context: {contextDocs.length} doc(s) ≈ {contextTokens} tok · prompt ≈ {promptEst} tok
        {maxCostUsd !== null ? ` · up to $${maxCostUsd.toFixed(4)}` : ""}
      </div>
      <div className="panel-row buttons">
        <button onClick={() => setPreview(buildPrompt())}>Preview prompt</button>
        <button onClick={() => setShowLast(true)} disabled={!lastGeneration}>
          Last prompt
        </button>
        {streaming ? (
          <button onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button onClick={generate} disabled={!instruction.trim() || !s.model}>
            Generate
          </button>
        )}
        <button onClick={() => onAppend(output)} disabled={!output || !activeDoc}>
          Append to doc
        </button>
        <button onClick={() => setOutput("")} disabled={!output}>
          Clear
        </button>
      </div>
      {error && <p className="error small">{error}</p>}
      <pre className="output">{output}{streaming ? "▌" : ""}</pre>
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
