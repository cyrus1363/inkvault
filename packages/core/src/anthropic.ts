import {
  ProviderError,
  toProviderError,
  type CompletionInfo,
  type StreamCallbacks,
} from "./openrouter.js";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicChatOptions {
  apiKey: string;
  model: string;
  system?: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function streamAnthropicChat(opts: AnthropicChatOptions, cb: StreamCallbacks = {}): Promise<CompletionInfo> {
  if (!opts.apiKey) {
    throw new ProviderError(0, "No Anthropic API key configured. Add it in Settings.");
  }
  if (!opts.model) {
    throw new ProviderError(0, "No model selected. Pick a model in the prompt panel.");
  }
  const res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.8,
      stream: true,
      ...(opts.system ? { system: opts.system } : {}),
      messages: opts.messages.filter((m) => m.role !== "system"),
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw await toProviderError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const json = JSON.parse(data) as {
            type: string;
            delta?: { type?: string; text?: string };
            message?: { usage?: { input_tokens?: number } };
            usage?: { output_tokens?: number };
          };
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta.text) {
            content += json.delta.text;
            cb.onDelta?.(json.delta.text);
          } else if (json.type === "message_start") {
            promptTokens = json.message?.usage?.input_tokens ?? null;
          } else if (json.type === "message_delta") {
            completionTokens = json.usage?.output_tokens ?? null;
          }
        } catch {
          // skip malformed chunk
        }
      }
    }
  }
  return {
    content,
    model: opts.model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null,
  };
}

export async function fetchAnthropicModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${ANTHROPIC_BASE_URL}/models`, {
    headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    signal,
  });
  if (!res.ok) throw await toProviderError(res);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => m.id);
}
