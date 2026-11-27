import type { CachedModel } from "./model.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class ProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export interface StreamCallbacks {
  onDelta?: (delta: string) => void;
}

export interface CompletionInfo {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface ChatCompletionOptions {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export function friendlyMessage(status: number, message: string): string {
  const lower = message.toLowerCase();
  switch (status) {
    case 401:
      return `Invalid API key (401). Check the key in Settings. Provider says: ${message}`;
    case 402:
      return `Insufficient credits (402). Top up the provider account and retry. Provider says: ${message}`;
    case 429:
      return `Rate limited (429). Wait a moment and retry. Provider says: ${message}`;
    case 400:
      if (lower.includes("context") || lower.includes("token")) {
        return `Context overflow (400): ${message}. Disable some binder documents or shorten the prompt.`;
      }
      return `Bad request (400): ${message}`;
    default:
      return `Provider error (${status}): ${message}`;
  }
}

async function toProviderError(res: Response): Promise<ProviderError> {
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    raw = "";
  }
  let message = raw || res.statusText;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) message = parsed.error.message;
  } catch {
    // keep raw body
  }
  return new ProviderError(res.status, friendlyMessage(res.status, message));
}

export async function fetchModels(apiKey: string, signal?: AbortSignal): Promise<CachedModel[]> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) throw await toProviderError(res);
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
    }>;
  };
  return (json.data ?? []).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    contextWindow: m.context_length ?? 0,
    pricing: {
      prompt: Number.parseFloat(m.pricing?.prompt ?? "0") || 0,
      completion: Number.parseFloat(m.pricing?.completion ?? "0") || 0,
    },
  }));
}

export async function streamChat(opts: ChatCompletionOptions, cb: StreamCallbacks = {}): Promise<CompletionInfo> {
  if (!opts.apiKey) {
    throw new ProviderError(0, "No API key configured. Add your OpenRouter key in Settings.");
  }
  if (!opts.model) {
    throw new ProviderError(0, "No model selected. Pick a model in Settings.");
  }
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
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
  let totalTokens: number | null = null;
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
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            cb.onDelta?.(delta);
          }
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens ?? null;
            completionTokens = json.usage.completion_tokens ?? null;
            totalTokens = json.usage.total_tokens ?? null;
          }
        } catch {
          // skip malformed SSE chunk
        }
      }
    }
  }
  return { content, model: opts.model, promptTokens, completionTokens, totalTokens };
}

export function estimateCostUsd(
  pricing: { prompt: number; completion: number },
  promptTokens: number,
  completionTokens: number,
): number {
  return pricing.prompt * promptTokens + pricing.completion * completionTokens;
}
