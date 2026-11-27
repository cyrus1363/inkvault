import {
  ProviderError,
  streamChatCompletion,
  type CompletionInfo,
  type StreamCallbacks,
} from "./openrouter.js";

export interface LocalChatOptions {
  baseUrl: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "") || "http://127.0.0.1:8080";
}

function unreachable(baseUrl: string, cause: unknown): ProviderError {
  return new ProviderError(
    0,
    `Local server unreachable at ${baseUrl} — is llama-server / ollama running? (${cause instanceof Error ? cause.message : String(cause)})`,
  );
}

export async function streamLocalChat(opts: LocalChatOptions, cb: StreamCallbacks = {}): Promise<CompletionInfo> {
  const base = normalizeBaseUrl(opts.baseUrl);
  if (!opts.model) {
    throw new ProviderError(0, "No local model selected. Pick a model loaded on the local server.");
  }
  try {
    const info = await streamChatCompletion(
      {
        url: `${base}/v1/chat/completions`,
        headers: { "Content-Type": "application/json" },
        body: {
          model: opts.model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.8,
          max_tokens: opts.maxTokens ?? 4096,
          stream: true,
        },
        signal: opts.signal,
      },
      cb,
    );
    return { ...info, model: opts.model };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw unreachable(base, e);
  }
}

export async function fetchLocalModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const base = normalizeBaseUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${base}/v1/models`, { signal });
  } catch (e) {
    throw unreachable(base, e);
  }
  if (!res.ok) {
    throw new ProviderError(res.status, `Local server error (${res.status}) listing models at ${base}`);
  }
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => m.id);
}
