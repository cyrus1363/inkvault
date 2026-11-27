export type HunkType = "keep" | "del" | "add";

export interface DiffHunk {
  type: HunkType;
  lines: string[];
}

const LCS_CAP = 2000;

function lcsHunks(am: string[], bm: string[]): DiffHunk[] {
  const n = am.length;
  const m = bm.length;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] =
        am[i] === bm[j]
          ? dp[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const runs: DiffHunk[] = [];
  const addRun = (type: HunkType, line: string) => {
    const last = runs[runs.length - 1];
    if (last && last.type === type) last.lines.push(line);
    else runs.push({ type, lines: [line] });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (am[i] === bm[j]) {
      addRun("keep", am[i]);
      i++;
      j++;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      addRun("del", am[i]);
      i++;
    } else {
      addRun("add", bm[j]);
      j++;
    }
  }
  while (i < n) {
    addRun("del", am[i]);
    i++;
  }
  while (j < m) {
    addRun("add", bm[j]);
    j++;
  }
  return runs;
}

function mergeAdjacent(hunks: DiffHunk[]): DiffHunk[] {
  const out: DiffHunk[] = [];
  for (const h of hunks) {
    const last = out[out.length - 1];
    if (last && last.type === h.type) last.lines.push(...h.lines);
    else out.push({ type: h.type, lines: [...h.lines] });
  }
  return out;
}

export function diffText(a: string, b: string): DiffHunk[] {
  if (a === b) return [];
  const al = a.split("\n");
  const bl = b.split("\n");
  let p = 0;
  while (p < al.length && p < bl.length && al[p] === bl[p]) p++;
  let s = 0;
  while (s < al.length - p && s < bl.length - p && al[al.length - 1 - s] === bl[bl.length - 1 - s]) s++;
  const am = al.slice(p, al.length - s);
  const bm = bl.slice(p, bl.length - s);
  const hunks: DiffHunk[] = [];
  if (p > 0) hunks.push({ type: "keep", lines: al.slice(0, p) });
  if (am.length <= LCS_CAP && bm.length <= LCS_CAP) {
    hunks.push(...lcsHunks(am, bm));
  } else {
    if (am.length) hunks.push({ type: "del", lines: am });
    if (bm.length) hunks.push({ type: "add", lines: bm });
  }
  if (s > 0) hunks.push({ type: "keep", lines: al.slice(al.length - s) });
  return mergeAdjacent(hunks);
}

export function hunkText(h: DiffHunk): string {
  return h.lines.join("\n");
}

export function applyHunks(hunks: DiffHunk[], isAccepted: (index: number) => boolean): string {
  const out: string[] = [];
  hunks.forEach((h, idx) => {
    if (h.type === "keep") {
      out.push(...h.lines);
    } else if (h.type === "add" && isAccepted(idx)) {
      out.push(...h.lines);
    } else if (h.type === "del" && !isAccepted(idx)) {
      out.push(...h.lines);
    }
  });
  return out.join("\n");
}
