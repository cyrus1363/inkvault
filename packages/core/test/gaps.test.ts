import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDoc,
  childrenOf,
  duplicateDoc,
  streamChat,
  streamCustomChat,
  updateDoc,
} from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("duplicateDoc", () => {
  it("deep-copies a subtree with fresh ids, title suffix, placed after the original", () => {
    let docs = [];
    let folder;
    ({ docs, doc: folder } = addDoc(docs, { title: "Foundation", kind: "folder" }));
    let a;
    ({ docs, doc: a } = addDoc(docs, { title: "Ch 1", kind: "document", parentId: folder.id }));
    ({ docs } = addDoc(docs, { title: "Ch 2", kind: "document", parentId: folder.id }));
    ({ docs } = addDoc(docs, { title: "Notes", kind: "document" }));

    const next = duplicateDoc(docs, folder.id);
    expect(next).toHaveLength(7);
    const folders = childrenOf(next, null).filter((d) => d.kind === "folder");
    expect(folders.map((f) => f.title)).toEqual(["Foundation", "Foundation (copy)"]);
    const copy = folders.find((f) => f.title === "Foundation (copy)")!;
    expect(copy.id).not.toBe(folder.id);
    expect(childrenOf(next, copy.id)).toHaveLength(2);
    expect(childrenOf(next, copy.id)[0].id).not.toBe(a.id);
    expect(childrenOf(next, copy.id)[0].title).toBe("Ch 1");
    expect(childrenOf(next, null).map((d) => d.order)).toEqual([0, 1, 2]);
  });
});

describe("lock flag", () => {
  it("can be toggled via updateDoc", () => {
    let docs = [];
    let d;
    ({ docs, doc: d } = addDoc(docs, { title: "Ch 1", kind: "document" }));
    const next = updateDoc(docs, d.id, { locked: true });
    expect(next[0].locked).toBe(true);
  });
});

describe("streamChat verbosity/reasoning", () => {
  it("includes verbosity and reasoning.effort only when set", async () => {
    const fetchMock = vi.fn(async () => new Response(new TextEncoder().encode("data: [DONE]\n\n"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await streamChat({ apiKey: "k", model: "m", messages: [], verbosity: "low", reasoningEffort: "high" });
    let body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.verbosity).toBe("low");
    expect(body.reasoning).toEqual({ effort: "high" });
    await streamChat({ apiKey: "k", model: "m", messages: [] });
    body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body.verbosity).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });
});

describe("streamCustomChat", () => {
  it("sends Authorization header when an api key is configured", async () => {
    const fetchMock = vi.fn(async () => new Response(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const info = await streamCustomChat({ baseUrl: "https://api.deepseek.com", apiKey: "sk-ds", model: "deepseek-chat", messages: [] });
    expect(info.content).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-ds");
  });
});
