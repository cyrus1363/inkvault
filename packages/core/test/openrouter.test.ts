import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateCostUsd,
  fetchModels,
  friendlyMessage,
  ProviderError,
  streamChat,
} from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(chunks: string[]): Response {
  const body = new TextEncoder().encode(chunks.join(""));
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("streamChat", () => {
  it("accumulates streamed deltas and final usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const deltas: string[] = [];
    const info = await streamChat(
      { apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }] },
      { onDelta: (d) => deltas.push(d) },
    );
    expect(info.content).toBe("Hello world");
    expect(deltas).toEqual(["Hello", " world"]);
    expect(info.promptTokens).toBe(10);
    expect(info.completionTokens).toBe(2);
    expect(info.totalTokens).toBe(12);
  });

  it("sends the expected request shape", async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]\n\n']));
    vi.stubGlobal("fetch", fetchMock);
    await streamChat({
      apiKey: "secret-key",
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.3,
      maxTokens: 512,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "openai/gpt-4o", stream: true, temperature: 0.3, max_tokens: 512 });
  });

  it("maps a 401 to a friendly invalid-key error with the raw message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })),
    );
    await expect(
      streamChat({ apiKey: "k", model: "m", messages: [] }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 401 });
    await expect(streamChat({ apiKey: "k", model: "m", messages: [] })).rejects.toThrow(/Invalid API key/);
  });

  it("maps a 400 context error to an actionable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens" } }), {
            status: 400,
          }),
      ),
    );
    await expect(streamChat({ apiKey: "k", model: "m", messages: [] })).rejects.toThrow(/Context overflow/);
  });

  it("requires an api key and model before calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(streamChat({ apiKey: "", model: "m", messages: [] })).rejects.toBeInstanceOf(ProviderError);
    await expect(streamChat({ apiKey: "k", model: "", messages: [] })).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchModels", () => {
  it("maps the models endpoint including per-token pricing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "anthropic/claude-sonnet-4",
                name: "Claude Sonnet 4",
                context_length: 200000,
                pricing: { prompt: "0.000003", completion: "0.000015" },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const models = await fetchModels("k");
    expect(models).toEqual([
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        contextWindow: 200000,
        pricing: { prompt: 0.000003, completion: 0.000015 },
      },
    ]);
  });
});

describe("friendlyMessage / estimateCostUsd", () => {
  it("covers 401/402/429/400/default", () => {
    expect(friendlyMessage(401, "x")).toContain("Invalid API key");
    expect(friendlyMessage(402, "x")).toContain("Insufficient credits");
    expect(friendlyMessage(429, "x")).toContain("Rate limited");
    expect(friendlyMessage(400, "context length exceeded")).toContain("Context overflow");
    expect(friendlyMessage(500, "boom")).toBe("Provider error (500): boom");
  });

  it("computes cost from per-token pricing", () => {
    expect(estimateCostUsd({ prompt: 0.000003, completion: 0.000015 }, 1000, 200)).toBeCloseTo(0.006);
  });
});
