export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function replaceAll(content: string, find: string, replace: string): { content: string; count: number } {
  if (!find) return { content, count: 0 };
  const parts = content.split(find);
  return { content: parts.join(replace), count: parts.length - 1 };
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
