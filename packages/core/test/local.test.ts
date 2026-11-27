import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalModels, normalizeBaseUrl, ProviderError, streamLocalChat } from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(chunks: string[]): Response {
  return new Response(new TextEncoder().encode(chunks.join("")), { status: 200 });
}

describe("normalizeBaseUrl", () => {
  it("trims trailing slashes and defaults empty input", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
    expect(normalizeBaseUrl("  ")).toBe("http://127.0.0.1:8080");
  });
});

describe("streamLocalChat", () => {
  it("posts to the OpenAI-compatible endpoint and streams deltas", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"local "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"reply"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const info = await streamLocalChat(
      { baseUrl: "http://127.0.0.1:11434/", model: "qwen3.gguf", messages: [{ role: "user", content: "hi" }] },
      { onDelta: (d) => deltas.push(d) },
    );
    expect(info.content).toBe("local reply");
    expect(info.model).toBe("qwen3.gguf");
    expect(deltas).toEqual(["local ", "reply"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "qwen3.gguf", stream: true });
  });

  it("maps a network failure to a friendly unreachable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(
      streamLocalChat({ baseUrl: "http://127.0.0.1:8080", model: "m", messages: [] }),
    ).rejects.toThrow(/Local server unreachable at http:\/\/127\.0\.0\.1:8080/);
  });

  it("requires a model id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      streamLocalChat({ baseUrl: "http://x", model: "", messages: [] }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchLocalModels", () => {
  it("maps /v1/models ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "a.gguf" }, { id: "b.gguf" }] }), { status: 200 })),
    );
    await expect(fetchLocalModels("http://127.0.0.1:8080")).resolves.toEqual(["a.gguf", "b.gguf"]);
  });

  it("maps unreachable servers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(fetchLocalModels("http://127.0.0.1:9999")).rejects.toThrow(/Local server unreachable/);
  });
});
