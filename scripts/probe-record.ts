import { promises as fs } from "node:fs";
import path from "node:path";
import { scoreRecord, screenRecords, prepareRecord } from "../src/lib/sources/accuracy-engine";
import type { Hackathon } from "../src/lib/types";

async function main() {
  const file = path.join(process.cwd(), "src", "data", "hackathons.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8")) as { hackathons: Hackathon[] };
  const now = new Date();
  const result = screenRecords(dataset.hackathons, now);
  const publishedIds = new Set(result.published.map((h) => h.id));

  const needles = process.argv.slice(2);
  const list = needles.length
    ? dataset.hackathons.filter((h) => needles.some((n) => h.name.toLowerCase().includes(n.toLowerCase())))
    : [
        ...result.published.slice().sort((a, b) => a.name.localeCompare(b.name)),
      ].filter((_, i) => i % 7 === 0);

  for (const raw of list.slice(0, 40)) {
    const h = prepareRecord(raw, now);
    const r = scoreRecord(raw, now);
    console.log(
      `${publishedIds.has(h.id) ? "PUB " : r.verdict === "review" ? "HOLD" : "REJ "} ${String(r.score).padStart(3)}  ${h.name}`,
    );
    console.log(`      url   : ${h.officialUrl}`);
    console.log(`      tags  : ${(h.tags ?? []).join(", ") || "-"}`);
    console.log(`      org   : ${h.organizer || "-"} | mode ${h.mode} | loc ${h.location || "-"} | country ${h.country ?? "-"}`);
    console.log(`      prize : cash ${h.cashPrizeUsd} credits ${h.creditPrizeUsd} claimed ${h.claimedPrizeUsd ?? 0} total ${h.totalPrizeUsd} breakdown ${h.prizeBreakdownPublished ? "y" : "n"}`);
    console.log(`      desc  : ${(h.description ?? "").slice(0, 140)}`);
    console.log(`      why   : ${r.reasons.join(" | ")}`);
    if (r.hardReject) console.log(`      HARD  : ${r.hardReject}`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
