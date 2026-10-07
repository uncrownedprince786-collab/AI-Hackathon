import type { Winner } from "./types";

/** Drops non-winner rows and duplicate project names from a winners list. */
export function cleanWinners(winners: Winner[]): Winner[] {
  const seen = new Set<string>();
  const out: Winner[] = [];
  for (const w of winners) {
    if (/^finalists?$/i.test(w.prize ?? "")) continue;
    const key = w.project ? `name:${w.project.toLowerCase().trim()}` : w.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}