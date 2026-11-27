import { useCallback, useRef, useState } from "react";
import {
  compilePrompt,
  estimateCostUsd,
  streamAnthropicChat,
  streamChat,
  streamCustomChat,
  streamLocalChat,
  type ChainDef,
  type CompiledPrompt,
  type CompletionInfo,
  type DocNode,
  type VaultData,
} from "@inkvault/core";

export interface GenerateInput {
  instruction: string;
  contextDocs: DocNode[];
  activeDoc: DocNode | null;
  selectionOverride?: { text: string; directions: string };
}

export interface Take {
  id: string;
  label: string;
  instruction: string;
  output: string;
  streaming: boolean;
  error?: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

export function useGenerate(data: VaultData, updateData: (mutate: (d: VaultData) => VaultData) => void) {
  const [takes, setTakes] = useState<Take[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<CompiledPrompt | null>(null);
  const aborts = useRef<Map<string, AbortController>>(new Map());

  const s = data.settings;
  const pricing = s.models.find((m) => m.id === s.model)?.pricing;

  const patchTake = useCallback((id: string, patch: Partial<Take>) => {
    setTakes((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const streamInto = useCallback(
    async (takeId: string, compiled: CompiledPrompt): Promise<CompletionInfo> => {
      const controller = new AbortController();
      aborts.current.set(takeId, controller);
      const base = {
        messages: compiled.messages,
        temperature: s.temperature,
        maxTokens: s.maxTokens,
        signal: controller.signal,
      };
      const onDelta = (d: string) =>
        setTakes((ts) => ts.map((t) => (t.id === takeId ? { ...t, output: t.output + d } : t)));
      const info: CompletionInfo =
        s.provider === "local"
          ? await streamLocalChat({ ...base, baseUrl: s.localBaseUrl, model: s.localModel }, { onDelta })
          : s.provider === "custom"
            ? await streamCustomChat(
                { ...base, baseUrl: s.customBaseUrl, apiKey: s.customApiKey || undefined, model: s.model },
                { onDelta },
              )
            : s.provider === "anthropic"
              ? await streamAnthropicChat(
                  { apiKey: s.anthropicApiKey, model: s.model, system: s.systemPrompt, ...base },
                  { onDelta },
                )
              : await streamChat(
                  { ...base, apiKey: s.apiKey, model: s.model, verbosity: s.verbosity, reasoningEffort: s.reasoningEffort },
                  { onDelta },
                );
      return info;
    },
    [s.provider, s.apiKey, s.model, s.localBaseUrl, s.localModel, s.customBaseUrl, s.customApiKey, s.anthropicApiKey, s.systemPrompt, s.verbosity, s.reasoningEffort, s.temperature, s.maxTokens],
  );

  const recordGeneration = useCallback(
    (take: Take, info: CompletionInfo, compiled: CompiledPrompt, instructionLabel: string) => {
      const modelId = s.provider === "local" ? s.localModel : s.model;
      const cost = pricing
        ? estimateCostUsd(pricing, info.promptTokens ?? compiled.estimatedPromptTokens, info.completionTokens ?? 0)
        : null;
      updateData((d) => ({
        ...d,
        generations: [
          {
            id: take.id,
            at: new Date().toISOString(),
            model: modelId,
            instruction: instructionLabel,
            promptPreview: compiled.messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n"),
            output: take.output || info.content,
            promptTokens: info.promptTokens,
            completionTokens: info.completionTokens,
            costUsd: cost,
          },
          ...d.generations,
        ].slice(0, 50),
      }));
    },
    [s.provider, s.localModel, s.model, pricing, updateData],
  );

  const compile = useCallback(
    (input: GenerateInput): CompiledPrompt => {
      if (input.selectionOverride) {
        const { text, directions } = input.selectionOverride;
        return compilePrompt({
          systemPrompt: s.systemPrompt,
          instruction: `Rewrite the text below. Apply these directions: ${directions}\nReturn only the rewritten text, no commentary.\n\n<text>\n${text}\n</text>`,
          contextDocs: input.contextDocs,
          activeDoc: null,
        });
      }
      return compilePrompt({
        systemPrompt: s.systemPrompt,
        instruction: input.instruction,
        contextDocs: input.contextDocs,
        activeDoc: input.activeDoc,
      });
    },
    [s.systemPrompt],
  );

  const generate = useCallback(
    async (input: GenerateInput, label?: string): Promise<string> => {
      const compiled = compile(input);
      setLastPrompt(compiled);
      const id = crypto.randomUUID();
      const take: Take = {
        id,
        label: label ?? `Take ${takes.length + 1}`,
        instruction: input.selectionOverride ? `[revise] ${input.selectionOverride.directions}` : input.instruction,
        output: "",
        streaming: true,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
      };
      setTakes((ts) => [...ts, take]);
      setActiveTakeId(id);
      try {
        const info = await streamInto(id, compiled);
        const finalOutput = info.content;
        setTakes((ts) =>
          ts.map((t) =>
            t.id === id
              ? { ...t, output: finalOutput || t.output, streaming: false, promptTokens: info.promptTokens, completionTokens: info.completionTokens }
              : t,
          ),
        );
        recordGeneration({ ...take, output: finalOutput }, info, compiled, take.instruction);
        return id;
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patchTake(id, { streaming: false, error: e instanceof Error ? e.message : String(e) });
        } else {
          patchTake(id, { streaming: false });
        }
        return id;
      }
    },
    [compile, takes.length, streamInto, patchTake, recordGeneration],
  );

  const runChain = useCallback(
    async (chain: ChainDef, contextDocs: DocNode[], activeDoc: DocNode | null) => {
      const id = crypto.randomUUID();
      const take: Take = {
        id,
        label: `Chain: ${chain.name}`,
        instruction: chain.steps.join(" → "),
        output: "",
        streaming: true,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
      };
      setTakes((ts) => [...ts, take]);
      setActiveTakeId(id);
      let previous = "";
      for (let i = 0; i < chain.steps.length; i++) {
        const stepInstruction =
          i === 0 ? chain.steps[i] : `${chain.steps[i]}\n\n<previous_step_output>\n${previous}\n</previous_step_output>`;
        const compiled = compile({ instruction: stepInstruction, contextDocs, activeDoc });
        setLastPrompt(compiled);
        try {
          const info = await streamInto(id, compiled);
          previous = info.content;
          setTakes((ts) => ts.map((t) => (t.id === id ? { ...t, output: previous } : t)));
          if (i === chain.steps.length - 1) {
            setTakes((ts) =>
              ts.map((t) => (t.id === id ? { ...t, streaming: false, promptTokens: info.promptTokens, completionTokens: info.completionTokens } : t)),
            );
            recordGeneration({ ...take, output: previous }, info, compiled, `chain:${chain.name}`);
          }
        } catch (e) {
          patchTake(id, { streaming: false, error: (e as Error).name === "AbortError" ? undefined : e instanceof Error ? e.message : String(e) });
          return id;
        }
      }
      return id;
    },
    [compile, streamInto, patchTake, recordGeneration],
  );

  const stop = useCallback(
    (id?: string) => {
      const target = id ?? activeTakeId;
      if (target) aborts.current.get(target)?.abort();
    },
    [activeTakeId],
  );

  const stopAll = useCallback(() => {
    for (const c of aborts.current.values()) c.abort();
  }, []);

  const removeTake = useCallback((id: string) => {
    setTakes((ts) => ts.filter((t) => t.id !== id));
    setActiveTakeId((cur) => (cur === id ? (takes[0]?.id ?? null) : cur));
  }, [takes]);

  const clear = useCallback(() => setTakes([]), []);

  const activeTake = takes.find((t) => t.id === activeTakeId) ?? null;

  return {
    takes,
    activeTake,
    activeTakeId,
    setActiveTakeId,
    generate,
    runChain,
    stop,
    stopAll,
    removeTake,
    clear,
    lastPrompt,
    pricing,
    get output() {
      return activeTake?.output ?? "";
    },
    get streaming() {
      return activeTake?.streaming ?? false;
    },
    get error() {
      return activeTake?.error;
    },
  };
}
