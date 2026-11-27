import type { DocNode } from "./model.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompiledPrompt {
  messages: ChatMessage[];
  includedDocs: DocNode[];
  estimatedPromptTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function compilePrompt(opts: {
  systemPrompt: string;
  instruction: string;
  contextDocs: DocNode[];
  activeDoc: DocNode | null;
}): CompiledPrompt {
  const sections: string[] = [];
  if (opts.contextDocs.length > 0) {
    const blocks = opts.contextDocs.map(
      (d) => `<document title="${escapeXml(d.title)}">\n${d.content}\n</document>`,
    );
    sections.push(`<context>\n${blocks.join("\n\n")}\n</context>`);
  }
  if (opts.activeDoc) {
    sections.push(
      `<active_document title="${escapeXml(opts.activeDoc.title)}">\n${opts.activeDoc.content}\n</active_document>`,
    );
  }
  sections.push(`<instruction>\n${opts.instruction}\n</instruction>`);
  const messages: ChatMessage[] = [];
  if (opts.systemPrompt.trim()) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  messages.push({ role: "user", content: sections.join("\n\n") });
  return {
    messages,
    includedDocs: opts.contextDocs,
    estimatedPromptTokens: messages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
  };
}
