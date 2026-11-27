import { useEffect, useMemo, useRef, useState } from "react";
import {
  compilePrompt,
  estimateCostUsd,
  estimateTokens,
  fetchLocalModels,
  fetchModels,
  findAutoContext,
  flattenTree,
  type CompiledPrompt,
  type DocNode,
  type ProviderKind,
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
  const [excludedAuto, setExcludedAuto] = useState<Set<string>>(new Set());
  const lastNonceRef = useRef(0);

  const gen = useGenerate(data, updateData);

  const treeDocs = useMemo(() => flattenTree(data.documents).map((r) => r.node), [data.documents]);
  const enabledDocs = useMemo(
    () => treeDocs.filter((d) => d.kind === "document" && d.contextEnabled),
    [treeDocs],
  );
  const autoDocs = useMemo(() => {
    if (!s.autoLorebook || !activeDoc) return [];
    return findAutoContext(data.documents, activeDoc.id, activeDoc.content).filter((d) => !excludedAuto.has(d.id));
  }, [s.autoLorebook, activeDoc, data.documents, excludedAuto]);
  const contextDocs = useMemo(() => [...enabledDocs, ...autoDocs], [enabledDocs, autoDocs]);

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
  const activeModelId = s.provider === "local" ? s.localModel : s.model;

  const buildInput = (text: string) => ({ instruction: text, contextDocs, activeDoc });

  async function refreshModels() {
    setModelsBusy(true);
    setModelError(undefined);
    try {
      if (s.provider === "local") {
        const localModels = await fetchLocalModels(s.localBaseUrl);
        updateData((d) => ({ ...d, settings: { ...d.settings, localModels } }));
      } else {
        const models = await fetchModels(s.apiKey);
        updateData((d) => ({ ...d, settings: { ...d.settings, models } }));
      }
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
  const [chainId, setChainId] = useState("");

  return (
    <aside className="prompt-panel">
      <div className="panel-row">
        <select
          value={s.provider}
          onChange={(e) =>
            updateData((d) => ({ ...d, settings: { ...d.settings, provider: e.target.value as ProviderKind } }))
          }
        >
          <option value="openrouter">OpenRouter (cloud, BYOK)</option>
          <option value="local">Local (llama.cpp / Ollama)</option>
        </select>
      </div>
      {s.provider === "local" ? (
        <>
          <div className="panel-row">
            {s.localModels.length > 0 ? (
              <select
                value={s.localModel}
                onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, localModel: e.target.value } }))}
              >
                <option value="">Select local model…</option>
                {s.localModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Local model id, e.g. qwen3-8b.gguf"
                value={s.localModel}
                onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, localModel: e.target.value } }))}
              />
            )}
            <button onClick={refreshModels} disabled={modelsBusy} title="List models from the local server">
              {modelsBusy ? "…" : "Refresh"}
            </button>
          </div>
          <div className="panel-row">
            <input
              placeholder="http://127.0.0.1:8080"
              value={s.localBaseUrl}
              onChange={(e) => updateData((d) => ({ ...d, settings: { ...d.settings, localBaseUrl: e.target.value } }))}
            />
          </div>
        </>
      ) : (
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
          <button
            onClick={refreshModels}
            disabled={modelsBusy || !s.apiKey}
            title="Fetch model list + pricing from OpenRouter"
          >
            {modelsBusy ? "…" : "Models"}
          </button>
        </div>
      )}
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
        Context: {enabledDocs.length} on{autoDocs.length > 0 ? ` + ${autoDocs.length} auto` : ""} · ≈{contextTokens} tok ·
        prompt ≈ {promptEst} tok{maxCostUsd !== null ? ` · up to $${maxCostUsd.toFixed(4)}` : ""}
      </div>
      {autoDocs.length > 0 && (
        <div className="chips">
          {autoDocs.map((d) => (
            <button key={d.id} className="chip auto" title={`Auto-included: matched in "${activeDoc?.title}" — click to exclude`}
              onClick={() => setExcludedAuto((prev) => new Set(prev).add(d.id))}>
              ✦ {d.title} ×
            </button>
          ))}
        </div>
      )}
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
          <button onClick={() => gen.stop()}>Stop</button>
        ) : (
          <>
            <button onClick={() => void gen.generate(buildInput(instruction))} disabled={!instruction.trim() || !activeModelId}>
              Generate
            </button>
            <button
              onClick={() => {
                void gen.generate(buildInput(instruction), "A");
                void gen.generate(buildInput(instruction), "B");
                void gen.generate(buildInput(instruction), "C");
              }}
              disabled={!instruction.trim() || !activeModelId}
              title="Generate 3 takes of the same prompt for kit-bashing"
            >
              Kit bash ×3
            </button>
          </>
        )}
        {s.chains.length > 0 && (
          <>
            <select value={chainId} onChange={(e) => setChainId(e.target.value)}>
              <option value="">Run chain…</option>
              {s.chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const chain = s.chains.find((c) => c.id === chainId);
                if (chain) void gen.runChain(chain, contextDocs, activeDoc);
              }}
              disabled={!chainId || gen.streaming}
            >
              Run
            </button>
          </>
        )}
      </div>
      {gen.takes.length > 0 && (
        <div className="take-tabs">
          {gen.takes.map((t) => (
            <button
              key={t.id}
              className={"take-tab" + (t.id === gen.activeTakeId ? " active" : "")}
              onClick={() => gen.setActiveTakeId(t.id)}
            >
              {t.streaming ? "…" : ""}
              {t.label}
              <span onClick={(e) => { e.stopPropagation(); gen.removeTake(t.id); }}> ×</span>
            </button>
          ))}
        </div>
      )}
      <div className="panel-row buttons">
        <button onClick={() => onAppend(gen.output)} disabled={!gen.output || !activeDoc}>
          Append to doc
        </button>
        <button onClick={gen.clear} disabled={gen.takes.length === 0}>
          Clear takes
        </button>
        {gen.takes.length > 1 && <button onClick={gen.stopAll}>Stop all</button>}
      </div>
      {gen.error && <p className="error small">{gen.error}</p>}
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
