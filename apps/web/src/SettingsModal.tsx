import { useState } from "react";
import { createId, type ChainDef, type CuratedList, type DocNode, type FontName, type ModelCollection, type PromptEntry, type ProviderKind, type Settings, type ThemeName } from "@inkvault/core";
import { getDesktopConfig, isTauri, localServerRunning, setDesktopConfig, startLocalServer, stopLocalServer, type DesktopConfig } from "./desktop";
import Modal from "./Modal";
import DataHelpSection from "./DataHelp";

const SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export default function SettingsModal({
  settings,
  docs,
  onSave,
  onSaveAliases,
  onClose,
}: {
  settings: Settings;
  docs: DocNode[];
  onSave: (patch: Partial<Settings>) => void;
  onSaveAliases: (docId: string, aliases: string[]) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ProviderKind>(settings.provider);
  const [customBaseUrl, setCustomBaseUrl] = useState(settings.customBaseUrl);
  const [customApiKey, setCustomApiKey] = useState(settings.customApiKey);
  const [anthropicApiKey, setAnthropicApiKey] = useState(settings.anthropicApiKey);
  const [verbosity, setVerbosity] = useState(settings.verbosity);
  const [reasoningEffort, setReasoningEffort] = useState(settings.reasoningEffort);
  const [collections, setCollections] = useState<ModelCollection[]>(settings.collections);
  const [curatedLists, setCuratedLists] = useState<CuratedList[]>(settings.curatedLists);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [localBaseUrl, setLocalBaseUrl] = useState(settings.localBaseUrl);
  const [localModel, setLocalModel] = useState(settings.localModel);
  const [serverCfg, setServerCfg] = useState<DesktopConfig>(getDesktopConfig());
  const [serverBusy, setServerBusy] = useState(false);
  const [serverMsg, setServerMsg] = useState<string>();
  const [temperature, setTemperature] = useState(settings.temperature);
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [library, setLibrary] = useState<PromptEntry[]>(settings.promptLibrary);
  const [chains, setChains] = useState<ChainDef[]>(settings.chains);
  const [theme, setTheme] = useState<ThemeName>(settings.theme);
  const [font, setFont] = useState<FontName>(settings.font);
  const [autoLorebook, setAutoLorebook] = useState(settings.autoLorebook);
  const [aliases, setAliases] = useState<Record<string, string>>(() =>
    Object.fromEntries(docs.filter((d) => d.kind === "document").map((d) => [d.id, (d.loreAliases ?? []).join(", ")])),
  );

  const setSlot = (slot: string, patch: Partial<PromptEntry>) => {
    setLibrary((prev) => {
      const existing = prev.find((p) => p.slot === slot);
      if (existing) return prev.map((p) => (p.slot === slot ? { ...p, ...patch } : p));
      return [...prev, { slot, label: slot, instruction: "", ...patch }];
    });
  };

  async function toggleServer() {
    setServerBusy(true);
    setServerMsg(undefined);
    try {
      if (await localServerRunning()) {
        await stopLocalServer();
        setServerMsg("Local server stopped.");
      } else {
        await startLocalServer(serverCfg.bin, serverCfg.modelPath, serverCfg.port, serverCfg.host);
        setDesktopConfig(serverCfg);
        setServerMsg(`Local server starting on ${serverCfg.host}:${serverCfg.port}…`);
      }
    } catch (e) {
      setServerMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setServerBusy(false);
    }
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <label>
        Provider
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderKind)}>
          <option value="openrouter">OpenRouter (cloud, BYOK)</option>
          <option value="local">Local (llama.cpp / Ollama) — no text leaves this machine</option>
        </select>
      </label>
      {provider === "openrouter" ? (
        <>
          <label>
            OpenRouter API key (stored only inside your encrypted vault)
            <input
              type="password"
              value={apiKey}
              placeholder="sk-or-…"
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <label>
            Default model id
            <input value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
        </>
      ) : provider === "custom" ? (
        <>
          <label>
            Custom endpoint base URL (OpenAI-compatible: OpenAI, DeepSeek, Mistral, Groq, Google's /openai endpoint…)
            <input value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
          </label>
          <label>
            API key for that endpoint (optional; stored only in the vault)
            <input type="password" value={customApiKey} onChange={(e) => setCustomApiKey(e.target.value)} />
          </label>
        </>
      ) : provider === "anthropic" ? (
        <label>
          Anthropic API key (direct; stored only inside your encrypted vault)
          <input type="password" value={anthropicApiKey} placeholder="sk-ant-…" onChange={(e) => setAnthropicApiKey(e.target.value)} />
        </label>
      ) : (
        <>
          <label>
            Local server base URL
            <input value={localBaseUrl} onChange={(e) => setLocalBaseUrl(e.target.value)} />
          </label>
          <label>
            Default local model id
            <input value={localModel} onChange={(e) => setLocalModel(e.target.value)} />
          </label>
        </>
      )}
      <div className="panel-row">
        <label>
          Verbosity
          <select value={verbosity} onChange={(e) => setVerbosity(e.target.value)}>
            <option value="auto">auto</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label>
          Reasoning effort (OpenRouter)
          <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)}>
            <option value="auto">auto</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>
      <fieldset className="library">
        <legend>Model collections (group models by task; comma-separated ids)</legend>
        {collections.map((c, i) => (
          <div key={c.id} className="chain-row">
            <input
              value={c.name}
              onChange={(e) => setCollections((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              placeholder="model-id-1, model-id-2"
              value={c.modelIds.join(", ")}
              onChange={(e) =>
                setCollections((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, modelIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)),
                )
              }
            />
            <button onClick={() => setCollections((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button onClick={() => setCollections((prev) => [...prev, { id: createId(), name: `Collection ${prev.length + 1}`, modelIds: [] }])}>
          + Add collection
        </button>
      </fieldset>
      <fieldset className="library">
        <legend>Curated lists (e.g. your Top 10; comma-separated ids — you maintain the contents)</legend>
        {curatedLists.map((c, i) => (
          <div key={c.id} className="chain-row">
            <input
              value={c.name}
              onChange={(e) => setCuratedLists((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              placeholder="model-id-1, model-id-2"
              value={c.modelIds.join(", ")}
              onChange={(e) =>
                setCuratedLists((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, modelIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)),
                )
              }
            />
            <button onClick={() => setCuratedLists((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button onClick={() => setCuratedLists((prev) => [...prev, { id: createId(), name: `List ${prev.length + 1}`, modelIds: [] }])}>
          + Add curated list
        </button>
      </fieldset>
      {isTauri() && (
        <fieldset className="library">
          <legend>Local model server (desktop)</legend>
          <label>
            llama-server binary path
            <input value={serverCfg.bin} onChange={(e) => setServerCfg({ ...serverCfg, bin: e.target.value })} placeholder="/usr/local/bin/llama-server" />
          </label>
          <label>
            GGUF model path
            <input value={serverCfg.modelPath} onChange={(e) => setServerCfg({ ...serverCfg, modelPath: e.target.value })} placeholder="/models/qwen3-8b.gguf" />
          </label>
          <div className="panel-row">
            <label>
              Host
              <input value={serverCfg.host} onChange={(e) => setServerCfg({ ...serverCfg, host: e.target.value })} />
            </label>
            <label>
              Port
              <input
                type="number"
                value={serverCfg.port}
                onChange={(e) => setServerCfg({ ...serverCfg, port: Number(e.target.value) })}
              />
            </label>
            <button onClick={toggleServer} disabled={serverBusy || !serverCfg.bin || !serverCfg.modelPath}>
              {serverBusy ? "…" : "Start / stop server"}
            </button>
          </div>
          {serverMsg && <p className="muted small">{serverMsg}</p>}
        </fieldset>
      )}
      <label>
        Temperature{" "}
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
        />{" "}
        {temperature}
      </label>
      <label>
        Max output tokens
        <input
          type="number"
          min={64}
          max={16384}
          step={64}
          value={maxTokens}
          onChange={(e) => setMaxTokens(Number(e.target.value))}
        />
      </label>
      <label>
        System prompt
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} />
      </label>
      <label>
        Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)}>
          <option value="lofi">lofi (owl mascot)</option>
          <option value="synthwave">synthwave (cat mascot)</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="high-contrast">High contrast</option>
        </select>
      </label>
      <label>
        Font
        <select value={font} onChange={(e) => setFont(e.target.value as FontName)}>
          <option value="default">Default</option>
          <option value="dyslexic">OpenDyslexic</option>
        </select>
      </label>
      <label className="row-check">
        <input type="checkbox" checked={autoLorebook} onChange={(e) => setAutoLorebook(e.target.checked)} />
        Auto-include lorebook sheets when their names/aliases appear in the active document
      </label>
      <fieldset className="library">
        <legend>Lorebook aliases (comma-separated, per document)</legend>
        {docs.filter((d) => d.kind === "document").map((d) => (
          <div key={d.id} className="library-row">
            <span className="slot">✦</span>
            <span className="muted small">{d.title}</span>
            <input
              placeholder="aliases, e.g. Ada, Countess"
              value={aliases[d.id] ?? ""}
              onChange={(e) => setAliases((prev) => ({ ...prev, [d.id]: e.target.value }))}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="library">
        <legend>Prompt chains (one instruction per line, run in order)</legend>
        {chains.map((c, i) => (
          <div key={c.id} className="chain-row">
            <input value={c.name} onChange={(e) => setChains((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <textarea
              rows={3}
              value={c.steps.join("\n")}
              onChange={(e) => setChains((prev) => prev.map((x, j) => (j === i ? { ...x, steps: e.target.value.split("\n").filter((l) => l.trim()) } : x)))}
            />
            <button onClick={() => setChains((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button onClick={() => setChains((prev) => [...prev, { id: createId(), name: `Chain ${prev.length + 1}`, steps: [""] }])}>
          + Add chain
        </button>
      </fieldset>
      <fieldset className="library">
        <legend>Hotkey prompt library (Ctrl/Cmd + 1–0)</legend>
        {SLOTS.map((slot) => {
          const entry = library.find((p) => p.slot === slot);
          return (
            <div key={slot} className="library-row">
              <span className="slot">{slot}</span>
              <input
                placeholder="Label"
                value={entry?.label === slot ? "" : (entry?.label ?? "")}
                onChange={(e) => setSlot(slot, { label: e.target.value || slot })}
              />
              <input
                placeholder="Instruction sent when the hotkey is pressed"
                value={entry?.instruction ?? ""}
                onChange={(e) => setSlot(slot, { instruction: e.target.value })}
              />
            </div>
          );
        })}
      </fieldset>
      <DataHelpSection />
      <div className="panel-row">
        <button
          onClick={() => {
            onSave({
              provider,
              apiKey,
              model,
              localBaseUrl,
              localModel,
              customBaseUrl,
              customApiKey,
              anthropicApiKey,
              verbosity,
              reasoningEffort,
              collections: collections.filter((c) => c.name.trim()),
              curatedLists: curatedLists.filter((c) => c.name.trim()),
              temperature,
              maxTokens,
              systemPrompt,
              promptLibrary: library.filter((p) => p.instruction.trim()),
              chains: chains.filter((c) => c.name.trim() && c.steps.length > 0),
              theme,
              font,
              autoLorebook,
            });
            for (const [docId, value] of Object.entries(aliases)) {
              const list = value.split(",").map((a) => a.trim()).filter(Boolean);
              onSaveAliases(docId, list);
            }
            onClose();
          }}
        >
          Save
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
