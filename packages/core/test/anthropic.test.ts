import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAnthropicModels, ProviderError, streamAnthropicChat } from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sse(chunks: string[]): Response {
  return new Response(new TextEncoder().encode(chunks.join("")), { status: 200 });
}

describe("streamAnthropicChat", () => {
  it("parses anthropic SSE events into content + usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":25}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    const info = await streamAnthropicChat(
      { apiKey: "sk-ant-x", model: "claude-sonnet-4", system: "sys", messages: [{ role: "user", content: "hi" }] },
      { onDelta: (d) => deltas.push(d) },
    );
    expect(info.content).toBe("Hello there");
    expect(deltas).toEqual(["Hello", " there"]);
    expect(info.promptTokens).toBe(25);
    expect(info.completionTokens).toBe(7);
    const [url, init] = (vi.mocked(fetch) as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-x");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "claude-sonnet-4", stream: true, system: "sys" });
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("maps 401 to invalid key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401 })),
    );
    await expect(streamAnthropicChat({ apiKey: "bad", model: "m", messages: [] })).rejects.toThrow(/Invalid API key/);
  });

  it("requires an api key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(streamAnthropicChat({ apiKey: "", model: "m", messages: [] })).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchAnthropicModels", () => {
  it("lists model ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4" }, { id: "claude-haiku-4" }] }), { status: 200 })),
    );
    await expect(fetchAnthropicModels("k")).resolves.toEqual(["claude-sonnet-4", "claude-haiku-4"]);
  });
});
