import { useCallback, useRef, useState } from "react";
import {
  compilePrompt,
  estimateCostUsd,
  streamChat,
  type CompiledPrompt,
  type DocNode,
  type VaultData,
} from "@inkvault/core";

export interface GenerateInput {
  instruction: string;
  contextDocs: DocNode[];
  activeDoc: DocNode | null;
  selectionOverride?: { text: string; directions: string };
}

export function useGenerate(data: VaultData, updateData: (mutate: (d: VaultData) => VaultData) => void) {
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string>();
  const [lastPrompt, setLastPrompt] = useState<CompiledPrompt | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const s = data.settings;
  const pricing = s.models.find((m) => m.id === s.model)?.pricing;

  const generate = useCallback(
    async (input: GenerateInput): Promise<string | null> => {
      let compiled: CompiledPrompt;
      if (input.selectionOverride) {
        const { text, directions } = input.selectionOverride;
        compiled = compilePrompt({
          systemPrompt: s.systemPrompt,
          instruction: `Rewrite the text below. Apply these directions: ${directions}\nReturn only the rewritten text, no commentary.\n\n<text>\n${text}\n</text>`,
          contextDocs: input.contextDocs,
          activeDoc: null,
        });
      } else {
        compiled = compilePrompt({
          systemPrompt: s.systemPrompt,
          instruction: input.instruction,
          contextDocs: input.contextDocs,
          activeDoc: input.activeDoc,
        });
      }
      setLastPrompt(compiled);
      setError(undefined);
      setOutput("");
      setStreaming(true);
      abortRef.current = new AbortController();
      try {
        const info = await streamChat(
          {
            apiKey: s.apiKey,
            model: s.model,
            messages: compiled.messages,
            temperature: s.temperature,
            maxTokens: s.maxTokens,
            signal: abortRef.current.signal,
          },
          { onDelta: (d) => setOutput((o) => o + d) },
        );
        const cost = pricing
          ? estimateCostUsd(pricing, info.promptTokens ?? compiled.estimatedPromptTokens, info.completionTokens ?? 0)
          : null;
        updateData((d) => ({
          ...d,
          generations: [
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              model: s.model,
              instruction: input.selectionOverride
                ? `[revise] ${input.selectionOverride.directions}`
                : input.instruction,
              promptPreview: compiled.messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n"),
              output: info.content,
              promptTokens: info.promptTokens,
              completionTokens: info.completionTokens,
              costUsd: cost,
            },
            ...d.generations,
          ].slice(0, 50),
        }));
        return info.content;
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : String(e));
        }
        return null;
      } finally {
        setStreaming(false);
      }
    },
    [s.apiKey, s.model, s.temperature, s.maxTokens, s.systemPrompt, pricing, updateData],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => setOutput(""), []);

  return { generate, output, streaming, error, stop, clear, lastPrompt, pricing };
}
