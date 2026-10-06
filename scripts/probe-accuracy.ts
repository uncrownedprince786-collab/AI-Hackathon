import { promises as fs } from "node:fs";
import path from "node:path";
import { screenRecords, scoreRecord } from "../src/lib/sources/accuracy-engine";
import type { Hackathon } from "../src/lib/types";

/**
 * Scores the stored dataset with the accuracy engine and prints what would be
 * published, held back or rejected. Read-only: nothing is written.
 */
async function main() {
  const file = path.join(process.cwd(), "src", "data", "hackathons.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8")) as { hackathons: Hackathon[] };
  const items = dataset.hackathons;
  const now = new Date();

  const result = screenRecords(items, now);
  const reports = new Map(result.reports.map((r) => [r.id, r]));

  const buckets: Record<string, number> = {};
  for (const r of result.reports) {
    const bucket = `${Math.floor(r.score / 10) * 10}-${Math.floor(r.score / 10) * 10 + 9}`;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }

  console.log(`records in: ${result.summary.total}`);
  console.log(`publish:    ${result.summary.published}`);
  console.log(`held(50-74):${result.summary.held}`);
  console.log(`rejected:   ${result.summary.rejected}`);
  console.log("\nmain causes:");
  for (const c of result.summary.causes.slice(0, 15)) console.log(`  ${String(c.count).padStart(4)}  ${c.cause}`);

  console.log("\nscore histogram:");
  for (const key of Object.keys(buckets).sort()) console.log(`  ${key}: ${buckets[key]}`);

  console.log("\n--- lowest scored PUBLISHABLE (watch for false positives) ---");
  const publishedIds = new Set(result.published.map((h) => h.id));
  const pub = result.reports
    .filter((r) => publishedIds.has(r.id))
    .sort((a, b) => a.score - b.score)
    .slice(0, 15);
  for (const r of pub) console.log(`  ${String(r.score).padStart(3)}  ${r.name.slice(0, 70)}`);

  console.log("\n--- REJECTED with 60+ score (watch for false negatives) ---");
  const nearMisses = result.reports
    .filter((r) => r.verdict === "reject" && r.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
  for (const r of nearMisses) {
    console.log(`  ${String(r.score).padStart(3)}  ${r.name.slice(0, 60)}  [${r.hardReject ?? ""}]`);
    console.log(`        ${r.reasons.join(" | ")}`);
  }

  console.log("\n--- sample of rejected records (are they really not AI?) ---");
  const rejected = result.reports.filter((r) => r.verdict === "reject").slice(0, 25);
  for (const r of rejected) console.log(`  ${String(r.score).padStart(3)}  ${r.name.slice(0, 75)}`);

  console.log("\n--- held for review (50-74) ---");
  for (const h of result.held.slice(0, 20)) {
    const r = reports.get(h.id);
    console.log(`  ${String(r?.score ?? "?").padStart(3)}  ${h.name.slice(0, 70)}`);
  }

  const scoreOf = (name: string) => {
    const h = items.find((i) => i.name.toLowerCase().includes(name.toLowerCase()));
    return h ? scoreRecord(h, now) : null;
  };
  console.log("\nspot checks:");
  for (const needle of ["Pear x Anthropic", "MCP", "Solana Skyline"]) {
    const r = scoreOf(needle);
    if (r) console.log(`  ${r.score} ${r.verdict} :: ${r.name.slice(0, 60)} :: ${r.reasons.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
