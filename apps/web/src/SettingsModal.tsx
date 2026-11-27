import { useState } from "react";
import type { PromptEntry, Settings } from "@inkvault/core";
import Modal from "./Modal";

const SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export default function SettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (patch: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [temperature, setTemperature] = useState(settings.temperature);
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [library, setLibrary] = useState<PromptEntry[]>(settings.promptLibrary);

  const setSlot = (slot: string, patch: Partial<PromptEntry>) => {
    setLibrary((prev) => {
      const existing = prev.find((p) => p.slot === slot);
      if (existing) return prev.map((p) => (p.slot === slot ? { ...p, ...patch } : p));
      return [...prev, { slot, label: slot, instruction: "", ...patch }];
    });
  };

  return (
    <Modal title="Settings" onClose={onClose}>
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
      <div className="panel-row">
        <button
          onClick={() => {
            onSave({
              apiKey,
              model,
              temperature,
              maxTokens,
              systemPrompt,
              promptLibrary: library.filter((p) => p.instruction.trim()),
            });
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
