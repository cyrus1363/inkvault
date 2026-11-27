import { useState } from "react";
import type { Settings } from "@inkvault/core";
import Modal from "./Modal";

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
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4} />
      </label>
      <div className="panel-row">
        <button
          onClick={() => {
            onSave({ apiKey, model, temperature, maxTokens, systemPrompt });
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
